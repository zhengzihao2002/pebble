import { LoadingBlock } from '@/components/shared/Spinner';

/** A centered working indicator; page-specific routes retain their own outlines. */
export default function AppGroupLoading() {
  return <LoadingBlock minHeight="max(320px, calc(100dvh - var(--pb-header-h, 80px) - 9rem))" size={64} labelSize="1rem" />;
}
