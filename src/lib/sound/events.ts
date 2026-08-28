/**
 * The events a sound can be attached to.
 *
 * Adding one means adding an entry here — the store, the Settings card and the
 * type all derive from this array, so nothing else needs editing.
 */

// ⚠️ KEYS ONLY - the label and hint that used to live here now sit in
// d.sounds.events / d.sounds.hints. This module is imported by the store, and
// display text has no business there.
//
// `as const` is LOAD-BEARING: SoundEvent is derived from these keys below, and
// those keys are the field names of the persisted soundPrefs object. Without
// it the union widens to string and the store loses its type entirely.
//
// The ORDER here is the order of the Settings card. It is not derived from the
// dictionary, so a translation can never reorder the list.
export const SOUND_EVENTS = [
  { key: 'expenseSaved' },
  { key: 'incomeSaved' },
  { key: 'saveFailed' },
  { key: 'click' },
  { key: 'goalReached' },
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number]['key'];

export const SOUND_EVENT_KEYS = SOUND_EVENTS.map((e) => e.key) as readonly SoundEvent[];

/** Every event silent. The required default: nothing plays until chosen. */
export function emptySoundPrefs(): Record<SoundEvent, string | null> {
  return SOUND_EVENT_KEYS.reduce((acc, key) => {
    acc[key] = null;
    return acc;
  }, {} as Record<SoundEvent, string | null>);
}
