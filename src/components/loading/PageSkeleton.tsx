import { CachedPageSkeleton } from './CachedPageSkeleton';
import DashboardLoading from '@/app/(app)/dashboard/loading';
import TransactionsLoading from '@/app/(app)/transactions/loading';
import { AnalysisSkeleton } from '@/components/analysis/AnalysisSkeleton';
import { ReportSkeleton } from '@/components/reports/ReportSkeleton';
import { AccountsSkeleton, InsightsSkeleton, BudgetsSkeleton, GoalsSkeleton, ScheduledSkeleton, SettingsSkeleton, PlannerSkeleton, AccountSettingsSkeleton } from './PageSkeletons';
import { LoadingStatus } from '@/components/dashboard/LoadingStatus';

function DefaultPageSkeleton({ pathname }: { pathname: string }) {
  let content;
  switch (pathname.split('/')[1]) {
    case 'dashboard': return <DashboardLoading/>;
    case 'transactions': return <TransactionsLoading/>;
    case 'analysis': return <AnalysisSkeleton withBar/>;
    case 'reports': return <ReportSkeleton/>;
    case 'accounts': content = <AccountsSkeleton/>; break;
    case 'insights': content = <InsightsSkeleton/>; break;
    case 'budgets': content = pathname.startsWith('/budgets/plan') ? <PlannerSkeleton/> : <BudgetsSkeleton/>; break;
    case 'goals': content = <GoalsSkeleton/>; break;
    case 'scheduled': content = <ScheduledSkeleton/>; break;
    case 'settings': content = <SettingsSkeleton/>; break;
    case 'account': content = <AccountSettingsSkeleton/>; break;
    default: return null;
  }
  return <><LoadingStatus/>{content}</>;
}

export function PageSkeleton({ pathname }: { pathname:string }) {
  return <CachedPageSkeleton pathname={pathname}><DefaultPageSkeleton pathname={pathname}/></CachedPageSkeleton>;
}
