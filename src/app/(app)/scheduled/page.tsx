import { getOwnWorkspaceUser } from '@/lib/partnerView.server';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getAccounts, getRecurringRules } from '@/lib/data/queries';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE } from '@/lib/time/timeZone';
import { getUpcomingSchedule, SCHEDULE_PREVIEW_DAYS } from '@/lib/recurring/preview';
import { ScheduledClient } from './ScheduledClient';

// Required on every page calling a Neon Auth method: the SDK reads cookies,
// so the page cannot be statically rendered. Doubly required here - catch-up
// writes, and getCategories() lazily seeds on read.
export const dynamic = 'force-dynamic';

export default async function ScheduledPage() {
  const userId = await getOwnWorkspaceUser('/scheduled');

  // Materialize anything due since the last visit BEFORE reading rules, so the
  // high-water marks below are current and today's occurrence is not listed as
  // still upcoming when it has in fact just been created.
  // Result captured, not discarded: a failure here must be visible rather than
  // showing up later as a payment that silently never appeared.
  const catchUp = await runRecurringCatchUp(userId);

  const [allRules, accounts] = await Promise.all([
    getRecurringRules(userId, { includeGhost: true }), getAccounts(userId, { includeGhost: true }),
  ]);
  const ghostIds = new Set(accounts.filter(account => account.isGhost).map(account => account.id));
  const rules = allRules.filter(rule => !ghostIds.has(rule.accountId));
  const ghostRules = allRules.filter(rule => ghostIds.has(rule.accountId));

  // Snapshotted once, mirroring getWindowPredicate in stats.ts, so a single
  // pass cannot straddle midnight.
  // Preview only - the fallback affects which dates are listed as upcoming on
  // a first load, never what gets written. Catch-up above skips entirely
  // rather than guessing, and the client refreshes once the cookie is set.
  const today = todayInZone((await resolveUserTimeZone(userId)) ?? FALLBACK_TIME_ZONE);
  const upcoming = getUpcomingSchedule(rules, today, { afterTodayOnly: false });

  return (
    <ScheduledClient
      rules={rules}
      ghostRules={ghostRules}
      ghostAccountNames={Object.fromEntries(accounts.filter(account => account.isGhost).map(account => [account.id, account.name]))}
      upcoming={upcoming}
      previewDays={SCHEDULE_PREVIEW_DAYS}
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
