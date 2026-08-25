import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ReportFilterPrefs } from '@/components/reports/types';
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

interface PebbleUIState {
  darkMode: boolean;
  textSize: number;
  // null means never set on this device: the Reports screen then resolves its
  // own date-based defaults rather than falling back to a stored month that
  // could be years old. Filter choices qualify as device preferences - they
  // describe how you like to look at the data, not the data itself.
  reportFilters: ReportFilterPrefs | null;
  dashboardPrefs: Partial<DashboardPrefs> | null;
  // Event -> sound file id, or null for silence. Always present rather than
  // nullable like the two above: those use null for "never set on this
  // device" because they resolve their own date-based defaults, whereas sound
  // has one universal default (silence) and needs no such distinction.
  //
  // A stored id whose file was later renamed or deleted resolves to nothing in
  // findSoundFile() and plays silence - no error, no cleanup needed.
  soundPrefs: Record<SoundEvent, string | null>;
  setDarkMode: (value: boolean) => void;
  setTextSize: (value: number) => void;
  setReportFilters: (value: ReportFilterPrefs) => void;
  setDashboardPrefs: (patch: Partial<DashboardPrefs>) => void;
  setSoundPref: (event: SoundEvent, soundId: string | null) => void;
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
      reportFilters: null,
      dashboardPrefs: null,
      // Static and date-free, matching the pattern used throughout: server and
      // first client render must agree exactly, and persist rehydrates after.
      soundPrefs: emptySoundPrefs(),
      setDarkMode: (value) => set({ darkMode: value }),
      setTextSize: (value) => set({ textSize: value }),
      setReportFilters: (value) => set({ reportFilters: value }),
      setDashboardPrefs: (patch) => set((state) => ({ dashboardPrefs: { ...state.dashboardPrefs, ...patch } })),
      // Merges, as setDashboardPrefs does: several dropdowns write into one
      // object, and a replacing setter would let the last one clear the rest.
      setSoundPref: (event, soundId) => set((state) => ({ soundPrefs: { ...state.soundPrefs, [event]: soundId } })),
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
        reportFilters: state.reportFilters,
        dashboardPrefs: state.dashboardPrefs,
        soundPrefs: state.soundPrefs,
      }),
    }
  )
);
