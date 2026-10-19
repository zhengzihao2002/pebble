'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

/** The announced half of the skeleton, which itself is decorative and can
 *  render on the server (where the locale is not known). */
export function AnalysisLoadingStatus() {
  const { d } = useTranslation();
  return <span role="status" className="pb-ana-sr">{d.ux.analysis.loading}</span>;
}
