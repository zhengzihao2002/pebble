import 'server-only';

import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { expense, income, recurringRule } from '@/db/schema';
import { getRulesDueForCatchUp } from '@/lib/data/queries';
import { generateTransId } from '@/lib/ids';
import {
  MAX_OCCURRENCES_PER_RUN,
  generateOccurrences,
  todayInZone,
  type Ymd,
} from './occurrences';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';

/**
 * Materializes due recurring occurrences into real expense/income rows.
 *
 * WHERE THIS RUNS: awaited at the top of each (app) page's Server Component,
 * before that page's own queries. NOT in (app)/layout.tsx - Next renders layout
 * and page in parallel, so the page's reads could start before catch-up
 * finished and new rows would surface one load late. Silently wrong.
 *
 * CONCURRENCY: two tabs loading at once compute the identical occurrence set
 * and both insert. The UNIQUE (recurring_rule_id, occurrence_date) constraint
 * makes the loser a no-op via ON CONFLICT DO NOTHING. No advisory lock and no
 * last_run_at timestamp - both would be racy anyway, and neither is needed.
 *
 * ATOMICITY: neon-http cannot hold an interactive transaction (transaction()
 * exists in the types but throws at runtime). batch() runs its statements in
 * one transaction, so the high-water mark advances if and only if the rows
 * committed. Inserts are ordered before mark updates within the batch.
 *
 * NEVER THROWS. A failure here must not take down a page the user was trying
 * to read; the occurrence is simply retried on the next load, which is safe
 * precisely because the whole thing is idempotent.
 */

/** Ceiling on rules processed per run. Guards against a pathological rule set. */
const MAX_RULES_PER_RUN = 100;

export interface CatchUpResult {
  expensesCreated: number;
  incomeCreated: number;
  rulesProcessed: number;
  /** True when a cap was hit and more work remains for the next load. */
  truncated: boolean;
  /** Set when the run failed. The caller renders normally regardless. */
  error?: string;
  /** True when the run was skipped because the user's timezone is not known yet. */
  awaitingTimeZone?: boolean;
}

const EMPTY: CatchUpResult = {
  expensesCreated: 0,
  incomeCreated: 0,
  rulesProcessed: 0,
  truncated: false,
};

/**
 * generateTransId() stamps the current time to the millisecond plus 4 random
 * chars. Materializing a long backfill generates many ids inside the same
 * millisecond, so uniqueness rests entirely on those 4 chars. Tracking issued
 * ids and regenerating on collision removes the birthday risk against a
 * primary key. Bounded so a broken generator cannot spin forever.
 */
function uniqueTransId(seen: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = generateTransId();
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
  }
  throw new Error('Could not generate a unique transaction id after 50 attempts.');
}

async function runCatchUp(userId: string): Promise<CatchUpResult> {
  // The user's own zone, from the cookie their browser set. Falling back to
  // UTC here would materialize a day early for anyone west of it - the very
  // bug this exists to prevent - so a run without a known zone is SKIPPED
  // rather than guessed. The client sets the cookie and refreshes once, and
  // catch-up is idempotent and late-by-design, so deferring one load is free.
  const timeZone = await resolveUserTimeZone(userId);
  if (timeZone === null) return { ...EMPTY, awaitingTimeZone: true };

  // Snapshot the clock ONCE for the whole run, mirroring getWindowPredicate in
  // stats.ts, so a single pass cannot straddle midnight.
  const today: Ymd = todayInZone(timeZone);

  const rules = await getRulesDueForCatchUp(userId, today);
  if (rules.length === 0) return EMPTY;

  const expenseValues: (typeof expense.$inferInsert)[] = [];
  const incomeValues: (typeof income.$inferInsert)[] = [];
  const markUpdates: { ruleId: string; through: Ymd }[] = [];
  const issuedIds = new Set<string>();

  let truncated = rules.length > MAX_RULES_PER_RUN;
  const batchRules = rules.slice(0, MAX_RULES_PER_RUN);

  for (const rule of batchRules) {
    const dates = generateOccurrences(rule, {
      after: rule.materializedThrough,
      through: today,
      limit: MAX_OCCURRENCES_PER_RUN,
    });

    const hitCap = dates.length >= MAX_OCCURRENCES_PER_RUN;
    if (hitCap) truncated = true;

    for (const date of dates) {
      if (rule.kind === 'expense') {
        expenseValues.push({
          id: uniqueTransId(issuedIds),
          userId,
          // Inherited from the rule: a materialized occurrence must land in
          // the same account the rule is attached to.
          accountId: rule.accountId,
          description: rule.description,
          category: rule.category,
          tag: rule.tag ?? '',
          transactionDate: date,
          paymentMethod: rule.paymentMethod,
          amount: rule.amount,
          recurringRuleId: rule.id,
          occurrenceDate: date,
        });
      } else {
        incomeValues.push({
          id: uniqueTransId(issuedIds),
          userId,
          accountId: rule.accountId,
          description: rule.description,
          category: rule.category,
          transactionDate: date,
          paymentMethod: rule.paymentMethod,
          // The rule stores NET in `amount`, matching Transaction.amount for
          // income. gross_amount is NOT NULL for income rules by CHECK, so the
          // fallback is unreachable - it exists only to satisfy the type.
          grossAmount: rule.grossAmount ?? rule.amount,
          netAmount: rule.amount,
          recurringRuleId: rule.id,
          occurrenceDate: date,
        });
      }
    }

    // Advance to `today`, not to the last occurrence: otherwise a monthly rule
    // marked on the 15th would re-generate-and-discard on every page load for
    // the rest of the month. Advancing makes the SQL gate exclude the rule
    // until tomorrow.
    //
    // When the per-rule cap truncated the run, advance only through what was
    // actually written so the next load resumes exactly there.
    const through = hitCap ? dates[dates.length - 1] : today;
    markUpdates.push({ ruleId: rule.id, through });
  }

  const statements = [
    ...(expenseValues.length
      ? [
          db
            .insert(expense)
            .values(expenseValues)
            .onConflictDoNothing({
              target: [expense.recurringRuleId, expense.occurrenceDate],
            }),
        ]
      : []),
    ...(incomeValues.length
      ? [
          db
            .insert(income)
            .values(incomeValues)
            .onConflictDoNothing({
              target: [income.recurringRuleId, income.occurrenceDate],
            }),
        ]
      : []),
    ...markUpdates.map((m) =>
      db
        .update(recurringRule)
        .set({ materializedThrough: m.through })
        .where(eq(recurringRule.id, m.ruleId)),
    ),
  ];

  if (statements.length === 0) return EMPTY;

  // Cast derived from db.batch's own signature rather than a hand-written type:
  // batch() requires a non-empty tuple, which a built-up array cannot satisfy.
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);

  return {
    expensesCreated: expenseValues.length,
    incomeCreated: incomeValues.length,
    rulesProcessed: batchRules.length,
    truncated,
  };
}

/**
 * cache() dedupes within a single render pass, so a page that reaches this
 * through more than one path still runs it once. It does NOT dedupe across
 * requests - cross-request safety is the UNIQUE constraint's job.
 */
export const runRecurringCatchUp = cache(
  async (userId: string): Promise<CatchUpResult> => {
    try {
      return await runCatchUp(userId);
    } catch (err) {
      console.error('[recurring] catch-up failed:', err);
      return { ...EMPTY, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
