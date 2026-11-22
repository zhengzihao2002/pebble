import { getOwnWorkspaceUser } from '@/lib/partnerView.server';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getExpenses, getIncome, getUserTimeZoneOverride, getAccounts, getRecurringRules } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { SettingsClient } from './SettingsClient';
import { cleanupCutoff, findAdjustmentCleanupGroups } from '@/lib/adjustmentCleanup';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';
import { groupTransactionTags, indexTaggedTransactions } from '@/lib/transactionTags';
import { readPartnerInboxAction, readPartnerSettingsAction } from '@/lib/actions/partner';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await getOwnWorkspaceUser('/settings');

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [expenses, income, adjustments, timeZoneOverride, accounts, rules, timeZone, partnerSettings, partnerInbox] = await Promise.all([
    getExpenses(userId, { includeGhost: true }),
    getIncome(userId, { includeGhost: true }),
    getBalanceAdjustments(userId, { includeGhost: true }),
    getUserTimeZoneOverride(userId),
    getAccounts(userId, { includeGhost: true }),
    getRecurringRules(userId, { includeGhost: true }),
    resolveUserTimeZone(userId),
    readPartnerSettingsAction(),
    readPartnerInboxAction(),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // Real per-account balances, for the accounts card: it shows each balance
  // and needs it to explain why a close is blocked. Same derivation as every
  // other page, so the figure here cannot disagree with the dashboard's.
  const balances = computeCurrentBalances(transactions, accounts, adjustments);

  // Whether each account has anything to move. Counted here from data already
  // in memory rather than queried per account in the card, which would mean N
  // round trips to grey out a button.
  const hasRecords: Record<string, boolean> = {};
  for (const r of [...transactions, ...adjustments, ...rules]) {
    hasRecords[r.accountId] = true;
  }
  const today = todayInZone(timeZone ?? FALLBACK_TIME_ZONE);

  return (
    <SettingsClient
      timeZoneOverride={timeZoneOverride}
      accounts={accounts}
      balancesByAccount={balances.byAccount}
      hasRecords={hasRecords}
      transactionTags={groupTransactionTags(expenses)}
      taggedTransactions={indexTaggedTransactions(expenses, accounts)}
      savedPartnerSettings={partnerSettings.ok ? partnerSettings.data : undefined}
      savedPartnerInbox={partnerInbox.ok ? partnerInbox.items : undefined}
      adjustmentCleanup={findAdjustmentCleanupGroups(
        adjustments, cleanupCutoff(today), new Set(accounts.map(a => a.id)),
      )}
      cleanupSources={adjustments.filter(row => row.transferGroupId == null && row.date <= today)
        .map(({ id, accountId, date, amount, description }) => ({ id, accountId, date, amount, description }))}
    />
  );
}
