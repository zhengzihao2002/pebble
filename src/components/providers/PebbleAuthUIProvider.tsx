'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
// Sign-up asks for the invite code alongside name, email and password. The
// /api/auth gate checks it against PEBBLE_INVITE_CODE and strips it before
// forwarding. emailOTP stays ON only because password reset uses email codes;
// email-code SIGN-IN is refused by that same gate.
const ADDITIONAL_FIELDS = {
  inviteCode: { label: 'Invite code', placeholder: 'Enter your invite code', required: true, type: 'string' as const },
};
const SIGN_UP = { fields: ['name', 'inviteCode'] };
// Verification is a SEPARATE switch from code sign-in. Neon requires new
// accounts to verify their email and emails a code; this shows the box to
// type it into. The /api/auth gate already allows the verification
// requests - only code SIGN-IN is refused there.
const EMAIL_VERIFICATION = { otp: true };

// Pages where email codes are switched OFF. The library ties the "Sign in
// with Email Code" button to the same emailOTP switch that password reset
// needs, and draws it as a plain button nothing else can target - so the
// switch is turned off only where that button appears. The /api/auth gate
// refuses code sign-in regardless; this only keeps the dead button off screen.
const EMAIL_OTP_OFF_PATHS = ['/auth/sign-in', '/auth/sign-up'];

export function PebbleAuthUIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      emailOTP={!EMAIL_OTP_OFF_PATHS.includes(pathname)}
      Link={Link}
      additionalFields={ADDITIONAL_FIELDS}
      signUp={SIGN_UP}
      emailVerification={EMAIL_VERIFICATION}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
