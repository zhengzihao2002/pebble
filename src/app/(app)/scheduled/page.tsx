import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getRecurringRules } from '@/lib/data/queries';
import { addDays, generateOccurrences, todayInZone } from '@/lib/recurring/occurrences';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE } from '@/lib/time/timeZone';
import type { UpcomingOccurrence } from '@/types';
import { ScheduledClient } from './ScheduledClient';

// Required on every page calling a Neon Auth method: the SDK reads cookies,
// so the page cannot be statically rendered. Doubly required here - catch-up
// writes, and getCategories() lazily seeds on read.
export const dynamic = 'force-dynamic';

/** How far ahead the upcoming list looks. */
const PREVIEW_DAYS = 60;

export default async function ScheduledPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize anything due since the last visit BEFORE reading rules, so the
  // high-water marks below are current and today's occurrence is not listed as
  // still upcoming when it has in fact just been created.
  // Result captured, not discarded: a failure here must be visible rather than
  // showing up later as a payment that silently never appeared.
  const catchUp = await runRecurringCatchUp(userId);

  const rules = await getRecurringRules(userId);

  // Snapshotted once, mirroring getWindowPredicate in stats.ts, so a single
  // pass cannot straddle midnight.
  // Preview only - the fallback affects which dates are listed as upcoming on
  // a first load, never what gets written. Catch-up above skips entirely
  // rather than guessing, and the client refreshes once the cookie is set.
  const today = todayInZone((await resolveUserTimeZone(userId)) ?? FALLBACK_TIME_ZONE);
  const horizon = addDays(today, PREVIEW_DAYS);

  // Same generator that materializes, run forward - a preview can never
  // disagree with what will actually be created.
  const upcoming: UpcomingOccurrence[] = rules
    .filter((rule) => rule.status === 'active')
    .flatMap((rule) =>
      generateOccurrences(rule, {
        // Exclusive lower bound. Catch-up ran above, so this is today for any
        // rule that has ever fired - today's occurrence already exists and must
        // not appear here as though it were still to come.
        after: rule.materializedThrough ?? addDays(today, -1),
        through: horizon,
        limit: 40,
      }).map((date) => ({
        ruleId: rule.id,
        description: rule.description,
        category: rule.category,
        kind: rule.kind,
        paymentMethod: rule.paymentMethod,
        amount: rule.amount,
        date,
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <ScheduledClient
      rules={rules}
      upcoming={upcoming}
      previewDays={PREVIEW_DAYS}
      catchUp={{
        expensesCreated: catchUp.expensesCreated,
        incomeCreated: catchUp.incomeCreated,
        truncated: catchUp.truncated,
        // The flag, not the message: the raw error can echo query fragments,
        // and it is already logged server-side in catchUp.ts.
        failed: catchUp.error !== undefined,
      }}
    />
  );
}
