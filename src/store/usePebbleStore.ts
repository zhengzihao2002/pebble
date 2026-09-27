import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ReportFilterPrefs } from '@/components/reports/types';
import type { Locale } from '@/lib/i18n/locale';
import { PEBBLE_UI_STORAGE_KEY } from './storageKeys';
import type { CjkFontChoice, FontChoice } from '@/lib/fontChoice';
import type { ThemeChoice } from '@/lib/themeChoice';
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


// Which picker Pebble's dropdowns use. 'searchable' is the type-to-filter
// combobox; 'plain' is the browser's native <select>. A device preference
// like the ones above: nothing here reaches Postgres.
export type SelectMode = 'searchable' | 'plain';

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
  // How often the manually entered paycheck arrives. The AMOUNT itself is
  // deliberately NOT stored: it is a personal figure, and this storage is per
  // device, shared by everyone who signs in on it. The amount lives in
  // ModifyBudgetModal's own state and is re-imported each time it opens.
  manualIncomeFrequency: ManualIncomeFrequency;
  // Read through SelectField, never by individual call sites. Any stored
  // value other than 'plain' is treated as 'searchable' there, so a key
  // written by an older or newer build cannot break a form.
  selectMode: SelectMode;
  // Typeface for text and headings. Validated where it is applied (AppShell
  // and the pre-paint script), so a value from an older or newer build falls
  // back to the default font instead of matching no CSS rule.
  fontChoice: FontChoice;
  // The CHINESE face, independent of the Latin one above - both always apply,
  // each to its own characters. Validated where applied, like the Latin one.
  cjkFontChoice: CjkFontChoice;
  // Dashboard health status bar. Off by default - opt-in decoration.
  showHealthBar: boolean;
  // Colour theme, independent of darkMode. Validated where applied.
  themeChoice: ThemeChoice;
  setDarkMode: (value: boolean) => void;
  setLocale: (value: Locale) => void;
  setTextSize: (value: number) => void;
  setReportFilters: (value: ReportFilterPrefs) => void;
  setDashboardPrefs: (patch: Partial<DashboardPrefs>) => void;
  setAnalysisPrefs: (patch: { window?: string }) => void;
  setSoundPref: (event: SoundEvent, soundId: string | null) => void;
  setIncomeEstimateMode: (value: IncomeEstimateMode) => void;
  setManualIncomeFrequency: (value: ManualIncomeFrequency) => void;
  setSelectMode: (value: SelectMode) => void;
  setFontChoice: (value: FontChoice) => void;
  setCjkFontChoice: (value: CjkFontChoice) => void;
  setShowHealthBar: (value: boolean) => void;
  resetFilterPrefs: () => void;
  setThemeChoice: (value: ThemeChoice) => void;
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
      manualIncomeFrequency: 'monthly',
      // Static, matching every other initial value here. 'searchable' is the
      // behaviour before this preference existed, so an upgrade changes nothing.
      selectMode: 'searchable',
      // Static, matching every other initial value here. 'default' is the
      // look before this preference existed, so an upgrade changes nothing.
      fontChoice: 'default',
      // Static; 'sans' is the Chinese face from before this preference existed.
      cjkFontChoice: 'sans',
      // Static, and off: an upgrade must not add anything to the dashboard.
      showHealthBar: false,
      // Static; 'original' is the look from before themes existed.
      themeChoice: 'original',
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
      setManualIncomeFrequency: (value) => set({ manualIncomeFrequency: value }),
      setSelectMode: (value) => set({ selectMode: value }),
      setFontChoice: (value) => set({ fontChoice: value }),
      setCjkFontChoice: (value) => set({ cjkFontChoice: value }),
      setShowHealthBar: (value) => set({ showHealthBar: value }),
      setThemeChoice: (value) => set({ themeChoice: value }),
      // Called only after a SUCCESSFUL sign-out (src/lib/auth/signOut.ts).
      // These describe one person's way of looking at their own data; the
      // next person on this browser should not inherit them. Device
      // preferences (theme, fonts, text size, language, sounds) stay.
      resetFilterPrefs: () => set({ reportFilters: null, dashboardPrefs: null, analysisPrefs: null }),
    }),
    {
      // Deliberately a NEW key. The old 'pebble-storage' entry held
      // transactions and balances from before the database migration. It is
      // never read, and AppShell now deletes it on load (LEGACY_STORAGE_KEY
      // in storageKeys.ts).
      // Imported, not literal: the pre-paint theme script in layout.tsx reads
      // this exact key, and a rename that missed it would silently restore the
      // dark-mode flash.
      name: PEBBLE_UI_STORAGE_KEY,
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : noopStorage)),
      // v1: the typed income AMOUNT stopped being stored - personal data in
      // shared per-device storage. Keeps a valid frequency, drops the rest.
      // persist writes the migrated state straight back, so the old amount
      // leaves localStorage on the first load of this build.
      version: 1,
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
        return state as unknown as PebbleUIState;
      },
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
        manualIncomeFrequency: state.manualIncomeFrequency,
        // Omitting this persists nothing and reports no error - the picker
        // choice would simply reset on every reload.
        selectMode: state.selectMode,
        // The pre-paint script reads this field (FONT_FIELD in storageKeys.ts).
        fontChoice: state.fontChoice,
        // Also read by the pre-paint script (CJK_FONT_FIELD in storageKeys.ts).
        cjkFontChoice: state.cjkFontChoice,
        showHealthBar: state.showHealthBar,
        // Also read by the pre-paint script (THEME_FIELD in storageKeys.ts).
        themeChoice: state.themeChoice,
      }),
    }
  )
);
