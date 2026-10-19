'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The announced half of the report skeleton: the skeleton itself is
 * decorative and can render on the server, which cannot read the locale.
 */
export function ReportLoadingStatus() {
  const { d } = useTranslation();
  return <span role="status" className="pb-rep-sr">{d.ux.reports.loadingReport}</span>;
}
