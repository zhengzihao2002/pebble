'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The announced half of the Transactions loading skeleton. The skeleton is a
 * Server Component and cannot read the locale; this small client piece reads
 * it from the dictionary, so the words are announced in the user's language
 * while the shapes stay decorative.
 */
export function LoadingStatus() {
  const { d } = useTranslation();
  return <span className="pb-loading-announcement" role="status">{d.common.loading}</span>;
}
