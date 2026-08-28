import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ReportFilterPrefs } from '@/components/reports/types';
import type { Locale } from '@/lib/i18n/locale';
import { PEBBLE_UI_STORAGE_KEY } from './storageKeys';
import { emptySoundPrefs, type SoundEvent } from '@/lib/sound/events';

/**
 * UI state only.
 *
 * All financial data - expenses, income, balances, budgets, goals - lives in
 * Postgres, scoped to the authenticated user, and is fetched by Server
 * Components. It must never be reintroduced here: localStorage is per-device
 * and per-browser, not per-user, so financial data stored here would leak
 * between accounts signing in on the same machine.
 *
 * darkMode and textSize stay because they are genuinely device preferences:
 * the right text size on a phone is not the right one on a desktop, and
 * neither is worth a database round trip on every page load.
 */
// Dashboard selector state. Three separate widgets write into one object, so
// the setter merges a patch rather than replacing - otherwise whichever
// component wrote last would clear the other two.
//
// The sub-period fields are nullable: null means "not chosen on this device
// yet", and each widget then resolves its own default from the periods
// actually present in the data.
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

export interface ManualIncomePrefs {
  // Kept as a STRING, matching how the per-category budget inputs in
  // ModifyBudgetModal already work: the input binds directly to this value,
  // and Number(...) is applied only where the number is actually needed.
  amount: string;
  frequency: ManualIncomeFrequency;
}

interface PebbleUIState {
  darkMode: boolean;
  textSize: number;
  // Display language. A DEVICE preference like the two above: it changes
  // nothing that is stored, compared or sent to Postgres. AppShell mirrors it
  // into the pebble-lang cookie so Server Components can read it too.
  locale: Locale;
  // null means never set on this device: the Reports screen then resolves its
  // own date-based defaults rather than falling back to a stored month that
  // could be years old. Filter choices qualify as device preferences - they
  // describe how you like to look at the data, not the data itself.
  reportFilters: ReportFilterPrefs | null;
  dashboardPrefs: Partial<DashboardPrefs> | null;
  // Analysis page preferences. Structural and string-typed on purpose:
  // localStorage can hold a window key written by an older or newer build,
  // so the page validates it on restore rather than trusting the type.
  analysisPrefs: { window?: string } | null;
  // Event -> sound file id, or null for silence. Always present rather than
  // nullable like the two above: those use null for "never set on this
  // device" because they resolve their own date-based defaults, whereas sound
  // has one universal default (silence) and needs no such distinction.
  //
  // A stored id whose file was later renamed or deleted resolves to nothing in
  // findSoundFile() and plays silence - no error, no cleanup needed.
  soundPrefs: Record<SoundEvent, string | null>;
  // Which of the two "estimated annual income" sources Modify Budget shows -
  // a device preference, exactly like the prefs above: it changes nothing
  // that is stored or sent to Postgres, only what number the modal displays
  // while you are setting budgets.
  incomeEstimateMode: IncomeEstimateMode;
  // The user's own typed figure, kept even while 'system' mode is selected,
  // so switching back to 'manual' does not lose what was entered.
  manualIncomePrefs: ManualIncomePrefs;
  setDarkMode: (value: boolean) => void;
  setLocale: (value: Locale) => void;
  setTextSize: (value: number) => void;
  setReportFilters: (value: ReportFilterPrefs) => void;
  setDashboardPrefs: (patch: Partial<DashboardPrefs>) => void;
  setAnalysisPrefs: (patch: { window?: string }) => void;
  setSoundPref: (event: SoundEvent, soundId: string | null) => void;
  setIncomeEstimateMode: (value: IncomeEstimateMode) => void;
  setManualIncomePrefs: (patch: Partial<ManualIncomePrefs>) => void;
}

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const usePebbleStore = create<PebbleUIState>()(
  persist(
    (set) => ({
      darkMode: false,
      textSize: 100,
      // Static, matching every other initial value here: the server and the
      // first client render must agree exactly, and persist rehydrates after.
      locale: 'en',
      reportFilters: null,
      dashboardPrefs: null,
      analysisPrefs: null,
      // Static and date-free, matching the pattern used throughout: server and
      // first client render must agree exactly, and persist rehydrates after.
      soundPrefs: emptySoundPrefs(),
      // Static, matching every other initial value here.
      incomeEstimateMode: 'system',
      manualIncomePrefs: { amount: '', frequency: 'monthly' },
      setDarkMode: (value) => set({ darkMode: value }),
      setLocale: (value) => set({ locale: value }),
      setTextSize: (value) => set({ textSize: value }),
      setReportFilters: (value) => set({ reportFilters: value }),
      setDashboardPrefs: (patch) => set((state) => ({ dashboardPrefs: { ...state.dashboardPrefs, ...patch } })),
      setAnalysisPrefs: (patch) => set((state) => ({ analysisPrefs: { ...state.analysisPrefs, ...patch } })),
      // Merges, as setDashboardPrefs does: several dropdowns write into one
      // object, and a replacing setter would let the last one clear the rest.
      setSoundPref: (event, soundId) => set((state) => ({ soundPrefs: { ...state.soundPrefs, [event]: soundId } })),
      setIncomeEstimateMode: (value) => set({ incomeEstimateMode: value }),
      // Merges, as setDashboardPrefs does: the amount and frequency fields are
      // edited independently, and a replacing setter would let editing one
      // clear the other.
      setManualIncomePrefs: (patch) => set((state) => ({ manualIncomePrefs: { ...state.manualIncomePrefs, ...patch } })),
    }),
    {
      // Deliberately a NEW key. The old 'pebble-storage' entry holds
      // transactions and balances from before the database migration;
      // pointing at a fresh key leaves that data untouched on disk rather
      // than merging stale financial state into the new shape.
      // Imported, not literal: the pre-paint theme script in layout.tsx reads
      // this exact key, and a rename that missed it would silently restore the
      // dark-mode flash.
      name: PEBBLE_UI_STORAGE_KEY,
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : noopStorage)),
      // darkMode MUST stay here - the pre-paint script reads it from the
      // persisted envelope (see DARK_MODE_FIELD in storageKeys.ts).
      partialize: (state) => ({
        darkMode: state.darkMode,
        textSize: state.textSize,
        // Omitting this persists nothing and reports no error - the language
        // would simply reset on every reload.
        locale: state.locale,
        reportFilters: state.reportFilters,
        dashboardPrefs: state.dashboardPrefs,
        analysisPrefs: state.analysisPrefs,
        soundPrefs: state.soundPrefs,
        incomeEstimateMode: state.incomeEstimateMode,
        manualIncomePrefs: state.manualIncomePrefs,
      }),
    }
  )
);
