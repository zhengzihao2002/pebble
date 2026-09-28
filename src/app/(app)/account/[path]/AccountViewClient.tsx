'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Shield, User } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PebbleSessionsCard } from '@/components/settings/PebbleSessionsCard';

/**
 * AccountView renders session-dependent content, so the server (no resolved
 * session) emits skeletons while the client (cookie in hand) resolves
 * immediately - a guaranteed hydration mismatch. ssr: false skips the server
 * render entirely rather than papering over the difference.
 */
const AccountView = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.AccountView),
  { ssr: false },
);

// The library's Security page is Change Password + Sessions. Its SessionsCard
// cannot show a location, so Pebble's replaces it; the password card stays
// the library's own, loaded client-only for the same reason as AccountView.
const ChangePasswordCard = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.ChangePasswordCard),
  { ssr: false },
);

const TABS = [
  { path: 'settings', icon: User },
  { path: 'security', icon: Shield },
] as const;

/**
 * .pebble-account maps the auth library's colour variables onto Pebble's
 * palette (globals.css), so its cards follow the theme and dark mode like
 * every other card.
 *
 * ONE sub-nav, drawn by Pebble on both pages. The library's own nav only
 * existed on Profile (AccountView) - Security is custom, so it vanished
 * there. hideNav turns the library's off so both pages match.
 */
export function AccountViewClient({ path }: { path: string }) {
  const { d } = useTranslation();
  const label = { settings: d.account.profile, security: d.account.security };

  return (
    <div className="pebble-account" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <nav className="account-subnav" aria-label={d.account.navLabel}>
        {/* Settings is the only entry point to these views - the sidebar has
            no Account item - so a fixed link back beats browser history. */}
        <Link href="/settings" className="account-subnav-back">
          <ChevronLeft size={16} />
          {d.account.backToSettings}
        </Link>
        <div className="account-tabs">
          {TABS.map(({ path: tab, icon: Icon }) => (
            <Link key={tab} href={`/account/${tab}`} aria-current={path === tab ? 'page' : undefined}>
              <Icon size={14} />
              {label[tab]}
            </Link>
          ))}
        </div>
      </nav>
      {path === 'security' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <ChangePasswordCard />
          <PebbleSessionsCard />
        </div>
      ) : (
        <AccountView path={path} hideNav />
      )}
    </div>
  );
}
