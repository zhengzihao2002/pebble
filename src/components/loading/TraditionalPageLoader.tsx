'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

/** CSS chooses this before hydration using the saved loading preference. */
export function TraditionalPageLoader() {
  const { d } = useTranslation();
  return <div className="pb-loading-traditional" role="status">
    <span className="pb-loading-traditional-circle" aria-hidden="true" />
    <p>{d.common.loading}</p>
  </div>;
}
