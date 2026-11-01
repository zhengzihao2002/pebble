'use client';

import { useSyncExternalStore } from 'react';
import { readManualIncomeDraft, writeManualIncomeDraft } from '@/lib/budgets/manualIncomeDraft';

const listeners = new Set<() => void>();
function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener('storage', notify);
  return () => { listeners.delete(notify); window.removeEventListener('storage', notify); };
}
function owner(): string | null {
  // Use the server-authenticated identity, never the previous user's theme
  // pointer while the browser's auth SDK is still resolving a new sign-in.
  return document.querySelector<HTMLMetaElement>('meta[name="pebble-session"]')?.content.split('|')[0] || null;
}
const snapshot = () => readManualIncomeDraft(owner());
const serverSnapshot = () => '';
function change(amount: string) {
  writeManualIncomeDraft(owner(), amount);
  for (const notify of listeners) notify();
}

export function useManualIncomeAmount() {
  return [useSyncExternalStore(subscribe, snapshot, serverSnapshot), change] as const;
}
