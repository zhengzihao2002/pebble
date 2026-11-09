'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { mountHtmlPreferences } from '@/lib/htmlPreferences';

/** One owner for boot preferences and later user-requested theme changes. */
export function HtmlPreferenceSync() {
  const pathname = usePathname();
  const onAuth = pathname?.startsWith('/auth/') ?? false;
  useLayoutEffect(() => mountHtmlPreferences(onAuth), [onAuth]);
  return null;
}
