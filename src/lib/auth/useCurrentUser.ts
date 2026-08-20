'use client';

import { authClient } from './client';

export interface CurrentUser {
  name: string;
  email: string;
  initials: string;
  image: string | null;
  isPending: boolean;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function useCurrentUser(): CurrentUser {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;

  const name = user?.name ?? '';
  const email = user?.email ?? '';

  return {
    name: name || (isPending ? '—' : 'Unknown user'),
    email: email || (isPending ? '' : ''),
    initials: name ? deriveInitials(name) : '—',
    image: user?.image ?? null,
    isPending,
  };
}
