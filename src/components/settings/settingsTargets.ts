/**
 * DOM ids of the exact rows the overview chips summarise. Fixed strings, never
 * translated. Each is set on the row (or card) that holds the control, so a
 * chip lands the reader on the setting itself instead of the top of the
 * section that contains it.
 */
export const SETTING_TARGETS = {
  theme: 'pb-set-theme',
  appearance: 'pb-set-appearance',
  language: 'pb-set-language',
  privacy: 'pb-set-privacy',
  locks: 'pb-set-locks',
} as const;
