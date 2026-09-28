'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import { isLocked, type SafetyLockKey } from './safetyLocks';

/** Whether this safety lock is on for the signed-in user. */
export function useSafetyLock(key: SafetyLockKey): boolean {
  return usePebbleStore((s) => isLocked(s.safetyLocks, key));
}
