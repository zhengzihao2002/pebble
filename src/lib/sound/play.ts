'use client';

/**
 * Sound playback.
 *
 * Deliberately fire-and-forget: playSound returns void, not a promise, so no
 * caller can await it and delay a save. Every failure is swallowed — a missing
 * file, a decode error or an autoplay block must never surface to the user or
 * interrupt a write.
 */

import { findSoundFile } from './manifest';

// One element per file, built on first play and reused. A fresh Audio per play
// leaks elements and refetches; reusing one means a rapid second play restarts
// the sound rather than layering, which is what UI feedback should do.
//
// Nothing is constructed at module load — no preloading on page load.
const cache = new Map<string, HTMLAudioElement>();

const DEFAULT_VOLUME = 0.5;

function getAudio(src: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  const existing = cache.get(src);
  if (existing) return existing;
  try {
    const audio = new Audio(src);
    audio.preload = 'none';
    audio.volume = DEFAULT_VOLUME;
    cache.set(src, audio);
    return audio;
  } catch {
    return null;
  }
}

/**
 * Play the sound with this id. A null/empty id, an id no longer in the
 * manifest (a renamed or deleted file), or any playback failure is silence.
 */
export function playSound(soundId: string | null | undefined): void {
  if (!soundId) return;
  const file = findSoundFile(soundId);
  // An unknown id is expected, not exceptional: a stored preference outlives
  // the file it points at if that file is renamed or removed.
  if (!file) return;

  const audio = getAudio(file.src);
  if (!audio) return;

  try {
    // Rewind so a repeated play restarts rather than being ignored while the
    // previous one is still running.
    audio.currentTime = 0;
    const result = audio.play();
    // Older browsers return undefined here rather than a promise.
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Swallowed by design.
  }
}

/** Drops cached elements. Only needed if a sound file is replaced in place. */
export function clearSoundCache(): void {
  cache.forEach((a) => { try { a.pause(); } catch { /* ignore */ } });
  cache.clear();
}
