/**
 * Exact rows/cards shared by the overview chips, command palette and deep
 * links. Fixed strings, never translated. Each belongs to the control itself
 * so navigation lands on a setting rather than only its containing section.
 */
export const SETTING_TARGETS = {
  balances: 'pb-set-balances',
  accounts: 'pb-set-accounts',
  categories: 'pb-set-categories',
  theme: 'pb-set-theme',
  textSize: 'pb-set-text-size',
  font: 'pb-set-font',
  appearance: 'pb-set-appearance',
  cardGlow: 'pb-set-card-glow',
  ambientBackground: 'pb-set-ambient-background',
  brandIcons: 'pb-set-brand-icons',
  healthBar: 'pb-set-health-bar',
  chartType: 'pb-set-chart-type',
  loadingStyle: 'pb-set-loading-style',
  welcome: 'pb-set-welcome',
  language: 'pb-set-language',
  timeZone: 'pb-set-time-zone',
  dropdowns: 'pb-set-dropdowns',
  privacy: 'pb-set-privacy',
  textSelection: 'pb-set-text-selection',
  sounds: 'pb-set-sounds',
  locks: 'pb-set-locks',
  pebbleAccount: 'pb-set-pebble-account',
} as const;

export const SOUND_SETTING_TARGETS = {
  expenseSaved: 'pb-set-sound-expense-saved',
  incomeSaved: 'pb-set-sound-income-saved',
  saveFailed: 'pb-set-sound-save-failed',
  click: 'pb-set-sound-click',
  goalReached: 'pb-set-sound-goal-reached',
} as const;

export const LOCK_SETTING_TARGETS = {
  deletePebbleAccount: 'pb-set-lock-delete-pebble-account',
  deleteAccounts: 'pb-set-lock-delete-accounts',
  deleteTransactions: 'pb-set-lock-delete-transactions',
  deleteCategories: 'pb-set-lock-delete-categories',
} as const;

export const SETTINGS_JUMP_EVENT = 'pebble:settings-jump';

/** Only recognised settings may be addressed by the command palette or a hash. */
export function isSettingTarget(id: string) {
  return [...Object.values(SETTING_TARGETS), ...Object.values(SOUND_SETTING_TARGETS), ...Object.values(LOCK_SETTING_TARGETS)]
    .some((target) => target === id);
}
