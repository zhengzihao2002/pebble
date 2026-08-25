/**
 * The events a sound can be attached to.
 *
 * Adding one means adding an entry here — the store, the Settings card and the
 * type all derive from this array, so nothing else needs editing.
 */

export const SOUND_EVENTS = [
  {
    key: 'expenseSaved',
    label: 'Expense saved',
    hint: 'Plays after an expense is successfully recorded.',
  },
  {
    key: 'incomeSaved',
    label: 'Income saved',
    hint: 'Plays after income is successfully recorded.',
  },
  {
    key: 'saveFailed',
    label: 'Save failed',
    hint: 'Plays when a save could not be completed.',
  },
  {
    key: 'click',
    label: 'Button click',
    hint: 'Plays on primary buttons. Fires often — worth trying before keeping.',
  },
  {
    key: 'goalReached',
    label: 'Goal reached',
    hint: 'Plays when a savings goal hits its target.',
  },
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
