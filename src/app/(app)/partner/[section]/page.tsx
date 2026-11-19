import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { loadPartnerSnapshot } from '@/lib/partnerSnapshot.server';
import { isPartnerSection } from '@/lib/partnerPaths';
import { partnerAccounts, partnerGoals, partnerRules, partnerTransactions } from '@/lib/partnerDisplay';
import { getDictionary } from '@/lib/i18n';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE } from '@/lib/time/timeZone';
import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { mergeTransactions } from '@/lib/stats';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { GoalsView } from '@/components/goals/GoalsView';
import { DashboardClient } from '../../dashboard/DashboardClient';
import { TransactionsClient } from '../../transactions/TransactionsClient';
import { AccountsClient } from '../../accounts/AccountsClient';
import { BudgetsClient } from '../../budgets/BudgetsClient';
import { ScheduledClient } from '../../scheduled/ScheduledClient';
import { ReportsClient } from '../../reports/ReportsClient';
import { AnalysisClient } from '../../analysis/AnalysisClient';
import { InsightsClient } from '../../insights/InsightsClient';
import { getUpcomingSchedule, SCHEDULE_PREVIEW_DAYS } from '@/lib/recurring/preview';

export const dynamic = 'force-dynamic';

const NO_CATCH_UP = { expensesCreated: 0, incomeCreated: 0, truncated: false };
function Restricted({ title, body }: { title: string; body: string }) {
  return <section className="card pb-partner-card"><SectionHeader icon={LockKeyhole} title={title} subtitle={body} /></section>;
}

export default async function PartnerSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isPartnerSection(section)) notFound();
  const [snapshot, locale] = await Promise.all([loadPartnerSnapshot(), resolveUserLocale()]);
  const d = getDictionary(locale);
  if (!snapshot.ok) return <Restricted title={d.partner.title} body={d.partner.viewUnavailable} />;
  if (section === 'settings') return <Restricted title={d.nav.settings} body={d.partner.settingsRestricted} />;

  const data = snapshot.data;
  const transactions = partnerTransactions(data, d.partner.hiddenTransaction);
  const expenses = transactions.filter(row => row.type === 'expense');
  const income = transactions.filter(row => row.type === 'income');
  const ledger = mergeTransactions(expenses, income);
  const accounts = partnerAccounts(data);
  const goals = partnerGoals(data);
  const rules = partnerRules(data);
  const categories = data.categories;
  const budgets = Object.fromEntries(data.budgets.map(row => [row.name, row.amount]));
  const canAnalyze = data.permissions.amounts && (data.permissions.income || data.permissions.expenses);

  switch (section) {
    case 'dashboard':
      return <DashboardClient transactions={ledger} categories={categories} budgets={budgets} accounts={accounts}
        balancesByAccount={{}} totalBalance={0} allocated={0} catchUp={NO_CATCH_UP} goals={goals} rules={rules} />;
    case 'transactions':
      return <TransactionsClient transactions={ledger} adjustments={[]}
        ledger={ledger.map(row => ({ transId: row.id, balancesAfter: {}, totalBalanceAfter: 0 }))}
        categories={categories} budgets={budgets} accounts={accounts}
        accountOpeningTotal={0} currentBalance={0} balancesByAccount={{}} />;
    case 'accounts':
      return <AccountsClient accounts={accounts} expenses={expenses} income={income} adjustments={[]} />;
    case 'goals':
      return <div className="pb-goals"><GoalsView goals={goals} /></div>;
    case 'reports':
      return <ReportsClient transactions={ledger} categories={categories} budgets={budgets} accounts={accounts} />;
    case 'analysis':
      return canAnalyze
        ? <AnalysisClient transactions={ledger} categories={categories} budgets={budgets} rules={rules} totalBalance={0} />
        : <Restricted title={d.nav.analysis} body={d.partner.amountsRestricted} />;
    case 'insights':
      return canAnalyze
        ? <InsightsClient transactions={ledger} categories={categories} budgets={budgets} rules={rules} goals={goals} accounts={accounts} />
        : <Restricted title={d.nav.insights} body={d.partner.amountsRestricted} />;
    case 'budgets':
    case 'scheduled': {
      const userId = await getSessionUserIdOrRedirect();
      const today = todayInZone((await resolveUserTimeZone(userId)) ?? FALLBACK_TIME_ZONE);
      if (section === 'budgets') return <BudgetsClient transactions={ledger} categories={categories} budgets={budgets} budgetsByYear={{}} today={today} />;
      return <ScheduledClient rules={rules} upcoming={getUpcomingSchedule(rules, today)} previewDays={SCHEDULE_PREVIEW_DAYS} catchUp={NO_CATCH_UP} />;
    }
  }
}
