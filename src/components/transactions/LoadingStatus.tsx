'use client';

import { LoadingBlock } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The announced half of the Transactions loading skeleton. The skeleton is a
 * Server Component and cannot read the locale; this small client piece reads
 * it from the dictionary, so the words are announced in the user's language
 * while the shapes stay decorative.
 */
export function LoadingStatus() {
  const { d } = useTranslation();
  return <div className="pb-page-loading-status"><LoadingBlock minHeight={0} size={64} labelSize="1rem" label={d.common.loading} /></div>;
}
