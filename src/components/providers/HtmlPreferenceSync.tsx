'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { mountHtmlPreferences } from '@/lib/htmlPreferences';
import { useTypographyPreferences } from '@/components/layout/useTypographyPreferences';

/** One owner for boot preferences and later user-requested theme changes. */
export function HtmlPreferenceSync() {
  const pathname = usePathname();
  const onAuth = pathname?.startsWith('/auth/') ?? false;
  // Own the root size before the async app layout and sidebar hydrate, just
  // like the palette. AppShell mounts too late to guard that startup interval.
  useTypographyPreferences(onAuth);
  useLayoutEffect(() => mountHtmlPreferences(onAuth), [onAuth]);
  return null;
}
