'use client';

import { useEffect, useState } from 'react';
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
  const { data, isPending: sessionPending } = authClient.useSession();

  // Neon Auth caches session data in a cookie, so on the client this hook
  // can resolve synchronously on the very first render - while the server
  // render has no resolved user and emits the placeholder. React then sees
  // different text on the server and the client and throws a hydration
  // mismatch.
  //
  // Staying "pending" until after mount makes the first client render
  // identical to the server's. The real name appears on the next render,
  // once hydration has completed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isPending = sessionPending || !mounted;
  const user = mounted ? data?.user : undefined;

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
