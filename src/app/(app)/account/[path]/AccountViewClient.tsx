'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * AccountView renders session-dependent content, so the server (no resolved
 * session) emits skeletons while the client (cookie in hand) resolves
 * immediately - a guaranteed hydration mismatch. ssr: false skips the server
 * render entirely rather than papering over the difference.
 *
 * Not an issue before this route moved into (app): it was statically
 * generated, so there was no per-request server render to disagree with.
 */
const AccountView = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.AccountView),
  { ssr: false },
);

export function AccountViewClient({ path }: { path: string }) {
  const { d } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Settings is the only entry point to these views - the sidebar has no
          Account item - so a fixed link back is more honest than relying on
          browser history. */}
      <Link
        href="/settings"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--ink-soft)', textDecoration: 'none', alignSelf: 'flex-start' }}
      >
        <ChevronLeft size={16} />
        {d.account.backToSettings}
      </Link>
      <AccountView path={path} />
    </div>
  );
}
