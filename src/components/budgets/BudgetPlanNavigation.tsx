'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

type Registration = { token: symbol; year: number };
type NavigationContext = { year: number | null; registerYear: (year: number) => () => void };
const Context = createContext<NavigationContext | null>(null);

/** Share the already-loaded budget year with the shell, without another DB read. */
export function BudgetPlanNavigationProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const registerYear = useCallback((year: number) => {
    const token = Symbol('budget-plan-navigation');
    setRegistration({ token, year });
    return () => setRegistration(current => current?.token === token ? null : current);
  }, []);
  const value = useMemo(() => ({ year: registration?.year ?? null, registerYear }), [registration, registerYear]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The budget page registers its server-resolved next year before first paint. */
export function BudgetPlanNavigationRegistration({ year }: { year: number }) {
  const registerYear = useContext(Context)?.registerYear;
  useLayoutEffect(() => registerYear?.(year), [registerYear, year]);
  return null;
}

export function useBudgetPlanNavigation(): number | null {
  return useContext(Context)?.year ?? null;
}
