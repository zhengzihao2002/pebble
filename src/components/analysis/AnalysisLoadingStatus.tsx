'use client';

import { LoadingBlock } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** The announced half of the skeleton, which itself is decorative and can
 *  render on the server (where the locale is not known). */
export function AnalysisLoadingStatus() {
  const { d } = useTranslation();
  return <div className="pb-page-loading-status"><LoadingBlock minHeight={0} size={64} labelSize="1rem" label={d.ux.analysis.loading} /></div>;
}
