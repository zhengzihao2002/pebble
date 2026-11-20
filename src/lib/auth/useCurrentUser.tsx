'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string | null;
}

export interface CurrentUser extends UserProfile {
  initials: string;
  isPending: boolean;
}

const CurrentUserContext = createContext<CurrentUser>({
  id: '', name: '—', email: '', image: null, createdAt: null, initials: '—', isPending: true,
});

export function CurrentUserProvider({ profile, children }: { profile: UserProfile; children: ReactNode }) {
  const parts = profile.name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length ? (parts[0][0] + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase() : '—';
  return (
    <CurrentUserContext.Provider value={{ ...profile, name: profile.name || profile.email, initials, isPending: false }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
