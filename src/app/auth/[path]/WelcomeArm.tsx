'use client';

import { useEffect } from 'react';
import { WELCOME_PENDING_KEY } from '@/store/storageKeys';

/**
 * Arms the welcome animation: whoever signs in (or up) from this tab sees it
 * once on the first app page. sessionStorage, so it is per tab and gone when
 * the tab closes.
 */
export function WelcomeArm() {
  useEffect(() => {
    try { window.sessionStorage.setItem(WELCOME_PENDING_KEY, '1'); } catch { /* storage unavailable */ }
  }, []);
  return null;
}
