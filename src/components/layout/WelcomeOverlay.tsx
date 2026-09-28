'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { authClient } from '@/lib/auth/client';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** Settings' Preview button dispatches this; AppShell listens. */
export const WELCOME_PREVIEW_EVENT = 'pebble-welcome-preview';

/**
 * An account created this recently is greeted as NEW: this is the sign-in
 * right after signing up. Generous, so a slow verification email still counts.
 */
const NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

/**
 * The welcome shown once after signing in (armed by the auth pages - see
 * WelcomeArm). About 2.5 s; a click skips it. The backdrop is the same in
 * every theme on purpose. Under reduced motion the global rule stops every
 * animation and it shows still, briefly.
 */
export function WelcomeOverlay({ onDone }: { onDone: () => void }) {
  const { d, t } = useTranslation();
  const { name } = useCurrentUser();
  const first = name.trim().split(/\s+/)[0] ?? '';
  // The account's creation time, from the session - exact, unlike guessing
  // from which auth page the user came through (sign-up passes through
  // verification, and possibly sign-in, on its way here).
  const { data: session } = authClient.useSession();
  const createdAt = session?.user?.createdAt;
  const isNew = createdAt ? Date.now() - new Date(createdAt).getTime() < NEW_ACCOUNT_WINDOW_MS : false;

  useEffect(() => {
    // The pre-paint cover has done its job: this overlay is on screen now.
    document.documentElement.classList.remove('pebble-welcoming');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(onDone, reduced ? 1200 : 2500);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="welcome" role="status" aria-live="polite" onClick={onDone}>
      <span className="welcome-glow" aria-hidden="true" />
      <div className="welcome-stage">
        <Image src="/icons/icon-192.png" alt="" width={72} height={72} priority className="welcome-logo" />
        <p className="font-display welcome-name">Pebble</p>
        <span className="welcome-line" aria-hidden="true" />
        {/* first is the user's own name - user data, never translated. */}
        <p className="font-display welcome-greeting">
          {first
            ? t(isNew ? d.welcome.greetingNew : d.welcome.greeting, { name: first })
            : d.welcome.greetingNoName}
        </p>
        <p className="welcome-tagline">{d.welcome.tagline}</p>
      </div>
    </div>
  );
}
