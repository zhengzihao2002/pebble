'use client';

import { LoadingBlock } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The announced half of the report skeleton: the skeleton itself is
 * decorative and can render on the server, which cannot read the locale.
 */
export function ReportLoadingStatus() {
  const { d } = useTranslation();
  return <div className="pb-page-loading-status"><LoadingBlock minHeight={0} size={64} labelSize="1rem" label={d.ux.reports.loadingReport} /></div>;
}
