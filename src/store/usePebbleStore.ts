import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
interface PebbleUIState {
  darkMode: boolean;
  textSize: number;
  setDarkMode: (value: boolean) => void;
  setTextSize: (value: number) => void;
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
      setDarkMode: (value) => set({ darkMode: value }),
      setTextSize: (value) => set({ textSize: value }),
    }),
    {
      // Deliberately a NEW key. The old 'pebble-storage' entry holds
      // transactions and balances from before the database migration;
      // pointing at a fresh key leaves that data untouched on disk rather
      // than merging stale financial state into the new shape.
      name: 'pebble-ui',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : noopStorage)),
      partialize: (state) => ({ darkMode: state.darkMode, textSize: state.textSize }),
    }
  )
);
