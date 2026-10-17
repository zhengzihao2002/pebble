'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The words a screen reader hears while the dashboard skeleton shows. A
 * client component so the route's loading.tsx - a Server Component, which
 * cannot read the locale - still announces in the reader's language, the
 * same way LoadingBlock resolves its own default text.
 */
export function LoadingStatus() {
  const { d } = useTranslation();
  return <span role="status" className="pb-dash-sr">{d.common.loading}</span>;
}
