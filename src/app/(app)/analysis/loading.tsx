import { AnalysisSkeleton } from '@/components/analysis/AnalysisSkeleton';

/**
 * Suspense fallback for /analysis only: the page's own outline instead of
 * the app-wide spinner, as /transactions and /reports do. Delete this file to
 * go back to the spinner (app)/loading.tsx documents as the default.
 *
 * Same ~180ms delayed fade-in as the spinner, so a warm navigation never
 * flashes a skeleton.
 */
export default function AnalysisLoading() {
  return <AnalysisSkeleton delayed withBar />;
}
