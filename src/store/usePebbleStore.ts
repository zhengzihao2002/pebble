import type { AccountSortMode } from '@/lib/accountOrder';
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { ReportFilterPrefs } from '@/components/reports/types';
import type { Locale } from '@/lib/i18n/locale';
import { LAST_USER_KEY, PEBBLE_UI_STORAGE_KEY, userStorageKey } from './storageKeys';
import type { CjkFontChoice, FontChoice } from '@/lib/fontChoice';
import { resolveThemeChoice, type ThemeChoice } from '@/lib/themeChoice';
import type { Appearance } from '@/lib/appearance';
import { DEFAULT_SAFETY_LOCKS, type SafetyLockKey, type SafetyLocks } from '@/lib/safetyLocks';
import { emptySoundPrefs, type SoundEvent } from '@/lib/sound/events';
import { clearManualIncomeDraft } from '@/lib/budgets/manualIncomeDraft';
import { normalizeAmbientSettings, type AmbientSettings } from '@/lib/ambientSettings';
import { normalizeCursorSize } from '@/lib/cursorSize';
import { normalizeTextSize } from '@/lib/textSize';

/**
 * UI state only.
 *
 * All financial data - expenses, income, balances, budgets, goals - lives in
 * Postgres, scoped to the authenticated user, and is fetched by Server
 * Components. It must never be reintroduced here.
 *
 * PER USER. Each signed-in user gets their own localStorage entry
 * (`pebble-ui:<userId>`), so two people on one device never see or overwrite
 * each other's preferences - see switchPebbleUser below. This is separation,
 * not security: anyone with the browser profile can read localStorage.
 */
// Dashboard selector state. Three separate widgets write into one object, so
// the setter merges a patch rather than replacing - otherwise whichever
// component wrote last would clear the other two.
//
// The sub-period fields are nullable: null means "not chosen yet", and each
// widget then resolves its own default from the periods actually present in
// the data.
export interface DashboardPrefs {
  statsMode: string;
  statsPeriod: string | null;
  breakdownMode: string;
  breakdownPeriod: string | null;
  trendMode: string;
  trendYear: string | null;
}

// Modify Budget's income-estimate feature. 'system' is the server-computed
// trailing-12-month figure already fetched with the modal's other data;
// 'manual' lets the user type a single paycheck amount and a frequency and
// annualizes it client-side. Neither value is ever written to Postgres - it
// only changes what number the modal shows while budgets are being set.
export type IncomeEstimateMode = 'system' | 'manual';

// No 'once', unlike RecurringRule's frequency: a one-off payment has no
// annual rate to compute. Includes 'semimonthly' (paid twice a month, 24
// times a year), which nothing else in Pebble needs - conflating it with
// biweekly (26 times a year) would misstate annual income by roughly one
// paycheck's worth for anyone paid that way.
export type ManualIncomeFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'yearly';

// Which picker Pebble's dropdowns use. 'searchable' is the type-to-filter
// combobox; 'plain' is the browser's native <select>.
export type SelectMode = 'searchable' | 'plain';

// How the Dashboard's "Where it went" card draws its categories.
export type BreakdownChart = 'donut' | 'bar';

export type LoadingStyle = 'cached' | 'spinner';

interface PebblePrefs {
  // Light, Dark, or System (follows the device live - useResolvedDark).
  appearance: Appearance;
  textSize: number;
  // Display language. Changes nothing that is stored, compared or sent to
  // Postgres. AppShell mirrors it into the pebble-lang cookie so Server
  // Components can read it too.
  locale: Locale;
  // null means never set: the Reports screen then resolves its own
  // date-based defaults rather than falling back to a stored month that
  // could be years old.
  reportFilters: ReportFilterPrefs | null;
  dashboardPrefs: Partial<DashboardPrefs> | null;
  // Structural and string-typed on purpose: localStorage can hold a window
  // key written by an older or newer build, so the page validates it on
  // restore rather than trusting the type.
  analysisPrefs: { window?: string } | null;
  // Event -> sound file id, or null for silence. A stored id whose file was
  // later renamed or deleted resolves to nothing in findSoundFile() and plays
  // silence - no error, no cleanup needed.
  soundPrefs: Record<SoundEvent, string | null>;
  incomeEstimateMode: IncomeEstimateMode;
  // How often the manually entered paycheck arrives. Its display-only amount
  // is remembered separately by server-authenticated user (manualIncomeDraft),
  // so the previous viewer's theme preferences can never supply that amount.
  manualIncomeFrequency: ManualIncomeFrequency;
  // Read through SelectField, never by individual call sites. Any stored
  // value other than 'plain' is treated as 'searchable' there.
  selectMode: SelectMode;
  // Validated where applied (AppShell and the pre-paint script), so a value
  // from an older or newer build falls back instead of matching no CSS rule.
  fontChoice: FontChoice;
  cjkFontChoice: CjkFontChoice;
  // Dashboard health status bar. Off by default - opt-in decoration.
  showHealthBar: boolean;
  ambientBackground: boolean;
  cardGlow: boolean;
  sidebarCollapsed: boolean;
  softCursor: boolean;
  cursorSize: number;
  ambientSettings: AmbientSettings;
  // Recognized merchant logos in transaction tiles. On unless disabled.
  showBrandIcons: boolean;
  themeChoice: ThemeChoice;
  // Per-user switches disabling risky buttons. Read through isLocked(), so a
  // lock missing from older saved settings takes its default.
  safetyLocks: Partial<SafetyLocks>;
  // Welcome animation after signing in. On by default.
  showWelcome: boolean;
  // Page loading: remembered card contours by default, or a centered spinner.
  loadingStyle: LoadingStyle;
  // Read as 'bar' only when exactly 'bar'; anything else is the donut.
  breakdownChart: BreakdownChart;
  // Privacy mode: whether amounts start blurred when the app opens.
  privacyOnLaunch: boolean;
  // Whether text in the app can be selected and copied. Off by default.
  allowTextSelect: boolean;
  // Insights' Worth knowing: ids the user marked Not useful.
  insightsDismissed: string[];
  accountSort: AccountSortMode;
  manualAccountOrder: string[];
}

interface PebbleUIState extends PebblePrefs {
  // Session only, never persisted (not in PebblePrefs or partialize):
  // whether amounts are blurred right now.
  privacyOn: boolean;
  setPrivacyOn: (value: boolean) => void;
  setPrivacyOnLaunch: (value: boolean) => void;
  setAllowTextSelect: (value: boolean) => void;
  dismissInsight: (id: string) => void;
  setAppearance: (value: Appearance) => void;
  setLocale: (value: Locale) => void;
  setTextSize: (value: number) => void;
  setReportFilters: (value: ReportFilterPrefs) => void;
  setDashboardPrefs: (patch: Partial<DashboardPrefs>) => void;
  setAnalysisPrefs: (patch: { window?: string }) => void;
  setSoundPref: (event: SoundEvent, soundId: string | null) => void;
  setIncomeEstimateMode: (value: IncomeEstimateMode) => void;
  setManualIncomeFrequency: (value: ManualIncomeFrequency) => void;
  setSelectMode: (value: SelectMode) => void;
  setAccountSort: (value: AccountSortMode) => void;
  setManualAccountOrder: (ids: string[]) => void;
  setFontChoice: (value: FontChoice) => void;
  setCjkFontChoice: (value: CjkFontChoice) => void;
  setShowHealthBar: (value: boolean) => void;
  setAmbientBackground: (value: boolean) => void;
  setCardGlow: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  setSoftCursor: (value: boolean) => void;
  setCursorSize: (value: number) => void;
  setAmbientSettings: (patch: Partial<AmbientSettings>) => void;
  resetAmbientSettings: () => void;
  setShowBrandIcons: (value: boolean) => void;
  setThemeChoice: (value: ThemeChoice) => void;
  setSafetyLock: (key: SafetyLockKey, value: boolean) => void;
  setShowWelcome: (value: boolean) => void;
  setLoadingStyle: (value: LoadingStyle) => void;
  setBreakdownChart: (value: BreakdownChart) => void;
}

// Static, date-free defaults: the server render and the first client render
// must agree exactly, and persist rehydrates after. Also the base every
// rehydrate starts from (see merge below), so switching to a user with
// nothing saved yields defaults - never the previous user's values.
const DEFAULT_PREFS: PebblePrefs = {
  appearance: 'system',
  textSize: 100,
  locale: 'en',
  reportFilters: null,
  dashboardPrefs: null,
  analysisPrefs: null,
  soundPrefs: emptySoundPrefs(),
  incomeEstimateMode: 'system',
  manualIncomeFrequency: 'monthly',
  selectMode: 'searchable',
  accountSort: 'default',
  manualAccountOrder: [],
  fontChoice: 'default',
  cjkFontChoice: 'sans',
  showHealthBar: false,
  ambientBackground: false,
  cardGlow: false,
  sidebarCollapsed: false,
  softCursor: false,
  cursorSize: 32,
  ambientSettings: normalizeAmbientSettings(undefined),
  showBrandIcons: true,
  themeChoice: 'original',
  safetyLocks: DEFAULT_SAFETY_LOCKS,
  showWelcome: true,
  loadingStyle: 'cached',
  breakdownChart: 'donut',
  privacyOnLaunch: false,
  allowTextSelect: false,
  insightsDismissed: [],
};

// ---- Per-user storage -------------------------------------------------------
// Each user's preferences live under `pebble-ui:<userId>`. LAST_USER_KEY
// points at the most recent user, so the pre-paint script and the signed-out
// pages - which run before anyone is known - show that user's look. Before
// any user is known on a device, the bare `pebble-ui` key is used; the first
// user to sign in claims it (which also migrates the old shared entry).
let activeUserId: string | null = null;
if (typeof window !== 'undefined') {
  try { activeUserId = window.localStorage.getItem(LAST_USER_KEY); } catch { activeUserId = null; }
}

const keyFor = (name: string) => (activeUserId ? `${name}:${activeUserId}` : name);

const perUserStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(keyFor(name)); } catch { return null; }
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(keyFor(name), value); } catch { /* storage unavailable */ }
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(keyFor(name)); } catch { /* storage unavailable */ }
  },
};

export const usePebbleStore = create<PebbleUIState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      setAppearance: (value) => set({ appearance: value }),
      setLocale: (value) => {
        if (get().locale === value) return;
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('pebble:before-language-change'));
        set({ locale: value });
      },
      setTextSize: (value) => set({ textSize: normalizeTextSize(value) }),
      setReportFilters: (value) => set({ reportFilters: value }),
      setDashboardPrefs: (patch) => set((state) => ({ dashboardPrefs: { ...state.dashboardPrefs, ...patch } })),
      setAnalysisPrefs: (patch) => set((state) => ({ analysisPrefs: { ...state.analysisPrefs, ...patch } })),
      // Merges, as setDashboardPrefs does: several dropdowns write into one
      // object, and a replacing setter would let the last one clear the rest.
      setSoundPref: (event, soundId) => set((state) => ({ soundPrefs: { ...state.soundPrefs, [event]: soundId } })),
      setIncomeEstimateMode: (value) => set({ incomeEstimateMode: value }),
      setManualIncomeFrequency: (value) => set({ manualIncomeFrequency: value }),
      setSelectMode: (value) => set({ selectMode: value }),
      setAccountSort: (value) => set({ accountSort: value }),
      setManualAccountOrder: (ids) => set({ accountSort: 'manual', manualAccountOrder: ids }),
      setFontChoice: (value) => set({ fontChoice: value }),
      setCjkFontChoice: (value) => set({ cjkFontChoice: value }),
      setShowHealthBar: (value) => set({ showHealthBar: value }),
      setAmbientBackground: (value) => set({ ambientBackground: value }),
      setCardGlow: (value) => set({ cardGlow: value }),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value === true }),
      setSoftCursor: (value) => set({ softCursor: value }),
      setCursorSize: (value) => set({ cursorSize: normalizeCursorSize(value) }),
      setAmbientSettings: (patch) => set((state) => ({ ambientSettings: normalizeAmbientSettings({ ...state.ambientSettings, ...patch }) })),
      resetAmbientSettings: () => set({ ambientSettings: normalizeAmbientSettings(undefined) }),
      setShowBrandIcons: (value) => set({ showBrandIcons: value }),
      setThemeChoice: (value) => set({ themeChoice: value }),
      setSafetyLock: (key, value) => set((state) => ({ safetyLocks: { ...state.safetyLocks, [key]: value } })),
      setShowWelcome: (value) => set({ showWelcome: value }),
      setLoadingStyle: (value) => set({ loadingStyle: value }),
      setBreakdownChart: (value) => set({ breakdownChart: value }),
      privacyOn: false,
      setPrivacyOn: (value) => set({ privacyOn: value }),
      setPrivacyOnLaunch: (value) => set({ privacyOnLaunch: value }),
      setAllowTextSelect: (value) => set({ allowTextSelect: value }),
      // Capped, newest kept, so the list cannot grow without bound.
      dismissInsight: (id) => set((state) => ({ insightsDismissed: [...(state.insightsDismissed ?? []).filter((x) => x !== id), id].slice(-200) })),
    }),
    {
      // Per-user key prefix - see perUserStorage. Imported, not literal: the
      // pre-paint theme script in layout.tsx reads the same keys.
      name: PEBBLE_UI_STORAGE_KEY,
      storage: createJSONStorage(() => perUserStorage),
      // Defaults FIRST, then what is saved. The default merge started from
      // the current in-memory state, which after switching users is the
      // PREVIOUS user's - a user with nothing saved would have inherited it.
      merge: (persisted, current) => {
        const restored = { ...((persisted ?? {}) as Partial<PebblePrefs> & Record<string, unknown>) };
        delete restored.showCardGlow;
        const merged = { ...current, ...DEFAULT_PREFS, ...restored };
        return { ...merged, sidebarCollapsed: merged.sidebarCollapsed === true, cardGlow: merged.cardGlow === true, softCursor: merged.softCursor === true, cursorSize: normalizeCursorSize(merged.cursorSize), textSize: normalizeTextSize(merged.textSize), themeChoice: resolveThemeChoice(merged.themeChoice), ambientSettings: normalizeAmbientSettings(merged.ambientSettings) };
      },
      // v1: the typed income AMOUNT stopped being stored. Keeps a valid
      // frequency, drops the rest; persist writes the migrated state back.
      version: 2,
      migrate: (persisted, version) => {
        const state = { ...((persisted ?? {}) as Record<string, unknown>) };
        if (version < 1) {
          const old = state.manualIncomePrefs as { frequency?: unknown } | undefined;
          const freq = old?.frequency;
          if (freq === 'weekly' || freq === 'biweekly' || freq === 'semimonthly' || freq === 'monthly' || freq === 'yearly') {
            state.manualIncomeFrequency = freq;
          }
          delete state.manualIncomePrefs;
        }
        // v2: the dark-mode switch became Light / Dark / System. Existing
        // users keep exactly what they had; a user new to a device gets
        // System from the defaults.
        if (version < 2) {
          if (typeof state.darkMode === 'boolean') state.appearance = state.darkMode ? 'dark' : 'light';
          delete state.darkMode;
        }
        return state as unknown as PebbleUIState;
      },
      // appearance, locale, fonts, themeChoice and loadingStyle MUST stay
      // here - the pre-paint script reads them (see storageKeys.ts).
      partialize: (state): PebblePrefs => ({
        appearance: state.appearance,
        textSize: state.textSize,
        locale: state.locale,
        reportFilters: state.reportFilters,
        dashboardPrefs: state.dashboardPrefs,
        analysisPrefs: state.analysisPrefs,
        soundPrefs: state.soundPrefs,
        incomeEstimateMode: state.incomeEstimateMode,
        manualIncomeFrequency: state.manualIncomeFrequency,
        selectMode: state.selectMode,
        accountSort: state.accountSort,
        manualAccountOrder: state.manualAccountOrder,
        fontChoice: state.fontChoice,
        cjkFontChoice: state.cjkFontChoice,
        showHealthBar: state.showHealthBar,
        ambientBackground: state.ambientBackground,
        cardGlow: state.cardGlow,
        sidebarCollapsed: state.sidebarCollapsed,
        softCursor: state.softCursor,
        cursorSize: state.cursorSize,
        ambientSettings: state.ambientSettings,
        showBrandIcons: state.showBrandIcons,
        themeChoice: state.themeChoice,
        safetyLocks: state.safetyLocks,
        // Also read by the pre-paint script (SHOW_WELCOME_FIELD).
        showWelcome: state.showWelcome,
        loadingStyle: state.loadingStyle,
        breakdownChart: state.breakdownChart,
        privacyOnLaunch: state.privacyOnLaunch,
        allowTextSelect: state.allowTextSelect,
        insightsDismissed: state.insightsDismissed,
      }),
    }
  )
);

/**
 * Loads THIS user's saved preferences. Called by AppShell once the session
 * knows who is signed in. A user new to this device claims the shared
 * pre-sign-in entry if there is one (which migrates the old shared key), or
 * otherwise starts from defaults - the merge above guarantees nothing carries
 * over from whoever used the device before.
 */
export async function switchPebbleUser(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !userId || activeUserId === userId) return;
  try {
    const ls = window.localStorage;
    const own = userStorageKey(userId);
    if (ls.getItem(own) === null) {
      const shared = ls.getItem(PEBBLE_UI_STORAGE_KEY);
      if (shared !== null) {
        ls.setItem(own, shared);
        ls.removeItem(PEBBLE_UI_STORAGE_KEY);
      }
    }
    ls.setItem(LAST_USER_KEY, userId);
  } catch { /* storage unavailable: preferences simply will not persist */ }
  activeUserId = userId;
  await usePebbleStore.persist.rehydrate();
}

/** Removes the active user's saved preferences (their account was deleted). */
export function forgetActivePebbleUser(): void {
  if (activeUserId) clearManualIncomeDraft(activeUserId);
  if (typeof window === 'undefined' || !activeUserId) return;
  try {
    window.localStorage.removeItem(userStorageKey(activeUserId));
    if (window.localStorage.getItem(LAST_USER_KEY) === activeUserId) window.localStorage.removeItem(LAST_USER_KEY);
  } catch { /* storage unavailable */ }
  activeUserId = null;
}
