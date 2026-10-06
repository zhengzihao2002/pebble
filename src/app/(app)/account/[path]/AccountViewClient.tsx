'use client';

import { useEffect, useRef, useState } from 'react';
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

// The tab shown before this page mounted. Switching tabs is a route change,
// which remounts this component, so the thumb slides FROM here. In memory
// only: a fresh page load starts with nothing and shows the thumb in place.
let lastTab: string | null = null;

interface Thumb { x: number; width: number; scale: number; sliding: boolean }

/**
 * .pebble-account maps the auth library's colour variables onto Pebble's
 * palette (globals.css), so its cards follow the theme and dark mode like
 * every other card.
 *
 * ONE sub-nav, drawn by Pebble on both pages. The library's own nav only
 * existed on Profile (AccountView) - Security is custom, so it vanished
 * there. hideNav turns the library's off so both pages match.
 *
 * The active tab is marked by a pine thumb that slides between tabs
 * (transform only). Until it is measured, the link's own pine background
 * shows, so there is never a frame without a highlight.
 */
export function AccountViewClient({ path }: { path: string }) {
  const { d } = useTranslation();
  const label = { settings: d.account.profile, security: d.account.security };

  const tabsRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [thumb, setThumb] = useState<Thumb | null>(null);
  // Captured once per mount: where the user came from, if another tab.
  const [cameFrom] = useState<string | null>(() => (lastTab && lastTab !== path ? lastTab : null));

  useEffect(() => {
    const box = tabsRef.current;
    const measure = (tab: string) => {
      const el = linkRefs.current[tab];
      if (!box || !el) return null;
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left - box.clientLeft, width: r.width };
    };
    const to = measure(path);
    if (!to) return;
    lastTab = path;
    const from = cameFrom ? measure(cameFrom) : null;
    if (!from) {
      setThumb({ x: to.x, width: to.width, scale: 1, sliding: false });
      return;
    }
    // Start on the old tab with no transition, then slide on the next frame.
    setThumb({ x: from.x, width: to.width, scale: from.width / to.width, sliding: false });
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setThumb({ x: to.x, width: to.width, scale: 1, sliding: true }));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [path, cameFrom]);

  // Text size or window changes move the tabs; re-place the thumb, no slide.
  useEffect(() => {
    const onResize = () => {
      const box = tabsRef.current;
      const el = linkRefs.current[path];
      if (!box || !el) return;
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setThumb({ x: r.left - b.left - box.clientLeft, width: r.width, scale: 1, sliding: false });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [path]);

  return (
    <div className="pebble-account" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <nav className="account-subnav" aria-label={d.account.navLabel}>
        {/* Settings is the only entry point to these views - the sidebar has
            no Account item - so a fixed link back beats browser history. */}
        <Link href="/settings" prefetch={false} className="account-subnav-back">
          <ChevronLeft size={16} />
          {d.account.backToSettings}
        </Link>
        <div ref={tabsRef} className={`account-tabs${thumb ? ' pb-thumb-ready' : ''}`}>
          {thumb && (
            <span
              aria-hidden="true"
              className={`account-tabs-thumb${thumb.sliding ? ' pb-sliding' : ''}`}
              style={{ width: thumb.width, transform: `translateX(${thumb.x}px) scaleX(${thumb.scale})` }}
            />
          )}
          {TABS.map(({ path: tab, icon: Icon }) => (
            <Link
              key={tab} href={`/account/${tab}`} prefetch={false}
              ref={(el) => { linkRefs.current[tab] = el; }}
              aria-current={path === tab ? 'page' : undefined}
            >
              <Icon size={14} />
              {label[tab]}
            </Link>
          ))}
        </div>
      </nav>
      <div style={cameFrom ? { animation: 'pb-fade-in var(--pb-dur-std) var(--pb-ease-out) both' } : undefined}>
        {path === 'security' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <ChangePasswordCard />
            <PebbleSessionsCard />
          </div>
        ) : (
          <AccountView path={path} hideNav />
        )}
      </div>
    </div>
  );
}
