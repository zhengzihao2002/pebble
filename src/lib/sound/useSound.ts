'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import type { SoundEvent } from './events';
import { playSound } from './play';

/**
 * Plays whatever sound is configured for an event, or nothing.
 *
 * Reads the store imperatively via getState() rather than subscribing: callers
 * only need the preference at the moment of firing, and a subscription would
 * re-render them on every unrelated preference change - and would leave the
 * delegated click listener holding a stale value.
 *
 * Fire-and-forget throughout: returns void, so no caller can await it.
 */
export function playEventSound(event: SoundEvent): void {
  try {
    const prefs = usePebbleStore.getState().soundPrefs;
    playSound(prefs?.[event] ?? null);
  } catch {
    // A sound must never break the thing that triggered it.
  }
}
