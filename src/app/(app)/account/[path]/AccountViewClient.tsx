'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Link from '@/components/loading/PendingLink';
import { ChevronLeft, Shield, User } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PebbleSessionsCard } from '@/components/settings/PebbleSessionsCard';
import { useNavGlass } from '@/components/layout/useNavGlass';

// Auth views resolve the session in the browser. Avoid server/client markup
// differences while preloading both account panels together.
const PendingPanel = () => <span className="pb-loading-announcement" aria-busy="true"/>;
const AccountView = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.AccountView),
  { ssr: false, loading: PendingPanel },
);
const ChangePasswordCard = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.ChangePasswordCard),
  { ssr: false, loading: PendingPanel },
);
const TABS = [
  { path: 'settings', icon: User },
  { path: 'security', icon: Shield },
] as const;

/** Profile and Security are two mounted panels of the same account screen.
 * Native history updates Next's pathname without a route fetch or a cached
 * page preview. Real hrefs retain refresh, Back/Forward and open-in-new-tab. */
export function AccountViewClient({ path }: { path: string }) {
  const { d } = useTranslation();
  const pathname = usePathname();
  const active = pathname === '/account/settings' ? 'settings'
    : pathname === '/account/security' ? 'security' : path;
  const primary = active === 'settings' || active === 'security';
  const label = { settings: d.account.profile, security: d.account.security };
  const { ref: tabsRef, indicatorRef } = useNavGlass<HTMLDivElement>(active, false, '[aria-current="page"]');

  return (
    <div className="pebble-account" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <nav className="account-subnav" aria-label={d.account.navLabel}>
        <Link href="/settings" prefetch={false} className="account-subnav-back">
          <ChevronLeft size={16} />
          {d.account.backToSettings}
        </Link>
        <div ref={tabsRef} className="account-tabs pb-nav-glass-host">
          <span ref={indicatorRef} aria-hidden="true" className="pb-nav-glass-indicator" />
          {TABS.map(({ path: tab, icon: Icon }) => {
            const href = `/account/${tab}`;
            return <a key={tab} href={href} data-pb-nav-link
              aria-current={active === tab ? 'page' : undefined}
              onClick={event => {
                if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                if (window.location.pathname !== href) window.history.pushState(null, '', href);
              }}>
              <Icon size={14} />
              {label[tab]}
            </a>;
          })}
        </div>
      </nav>
      {primary ? <>
        <div data-account-panel="settings" hidden={active !== 'settings'} inert={active !== 'settings'}>
          <AccountView path="settings" hideNav />
        </div>
        <div data-account-panel="security" hidden={active !== 'security'} inert={active !== 'security'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <ChangePasswordCard />
            <PebbleSessionsCard />
          </div>
        </div>
      </> : <AccountView path={active} hideNav />}
    </div>
  );
}
