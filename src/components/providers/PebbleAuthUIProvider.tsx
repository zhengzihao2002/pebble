'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import { authClient } from '@/lib/auth/client';

/**
 * Exists ONLY so Link can be passed to NeonAuthUIProvider.
 *
 * Link is a function, and a Server Component cannot pass a function prop
 * across the RSC boundary - doing it directly in layout.tsx fails the build
 * with "Functions cannot be passed directly to Client Components". Marking
 * this 'use client' puts the boundary above the provider instead of below
 * it, so Link never crosses anything.
 *
 * Why bother: Better Auth UI's default link is a plain <a>, so every
 * internal tab click inside AccountView did a full document navigation.
 * That repainted from scratch (a white flash in dark mode before the
 * pre-paint script restored pebble-dark) and cut off AppShell's pointerdown
 * click sound mid-playback. Only surfaced once the account views moved
 * inside AppShell and there was finally a shell worth preserving.
 */
export function PebbleAuthUIProvider({ children }: { children: ReactNode }) {
  return (
    <NeonAuthUIProvider authClient={authClient} emailOTP Link={Link}>
      {children}
    </NeonAuthUIProvider>
  );
}
