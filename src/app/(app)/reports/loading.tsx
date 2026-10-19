import { ReportSkeleton } from '@/components/reports/ReportSkeleton';

/**
 * Suspense fallback for /reports only: the report's own outline (toolbar,
 * summary, rows) instead of the app-wide spinner, as /transactions does.
 *
 * Flagged for the owner: (app)/loading.tsx documents the large spinner as a
 * deliberate choice for every route. This overrides it for this one route;
 * delete this file to go back to the spinner.
 *
 * Same ~180ms delayed fade-in as the spinner (is-delayed), so a warm
 * navigation never flashes a skeleton.
 */
export default function ReportsLoading() {
  return <ReportSkeleton delayed />;
}
