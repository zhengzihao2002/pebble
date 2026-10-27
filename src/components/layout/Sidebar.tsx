'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { PebbleMark } from '@/components/brand/PebbleMark';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useResolvedDark } from '@/lib/useResolvedDark';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { NavButton } from './NavButton';
import { SignOutButton } from './SignOutButton';
import { NAV_GROUPS, navItems } from './navItems';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function Sidebar() {
  const appearance = usePebbleStore((s) => s.appearance);
  const setAppearance = usePebbleStore((s) => s.setAppearance);
  const darkMode = useResolvedDark();
  // On System the button says so. A click leaves System for the OPPOSITE
  // of what is on screen; returning to System happens only in Settings.
  const onSystem = appearance === 'system';
  const { name, email, initials } = useCurrentUser();
  const { d } = useTranslation();
  const byHref = new Map(navItems.map((i) => [i.href, i]));
  const settings = byHref.get('/settings');

  return (
    <aside className="pebble-sidebar">
      <div className="pb-sidebar-brand">
        <PebbleMark size={34} />
        <span className="font-display pb-sidebar-wordmark">Pebble</span>
      </div>
      {/* Grouped for scanning (NAV_GROUPS); the links themselves are the same
          NavButtons in the same order. Each caption labels its group, so a
          screen reader hears the grouping too. */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="pb-shell-side-group" role="group" aria-labelledby={`pb-side-${group.id}`}>
            <p id={`pb-side-${group.id}`} className="pb-shell-side-cap">{d.ux.shell[group.labelKey]}</p>
            {group.hrefs.map((href) => {
              const item = byHref.get(href);
              return item ? <NavButton key={href} href={href} icon={item.icon} label={d.nav[item.labelKey]} /> : null;
            })}
          </div>
        ))}
      </nav>
      {/* Settings is pinned above the account block, apart from the pages -
          still a link inside a <nav>, so it keeps the panel look. */}
      {settings && (
        <nav className="pb-shell-side-pinned" aria-label={d.nav[settings.labelKey]} style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
          <NavButton href={settings.href} icon={settings.icon} label={d.nav[settings.labelKey]} />
        </nav>
      )}
      <div className="pb-shell-side-foot" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <button onClick={() => setAppearance(darkMode ? 'light' : 'dark')} className="nav-btn">
          {onSystem ? <Monitor size={18} /> : darkMode ? <Moon size={18} /> : <Sun size={18} />}
          {onSystem ? d.sidebar.system : darkMode ? d.sidebar.darkMode : d.sidebar.lightMode}
        </button>
        <SignOutButton />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem' }}>
          <div className="pb-sidebar-avatar" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0, lineHeight: 1 }}>
            <span className="pb-sidebar-initials">{initials}</span>
          </div>
          <div style={{ fontSize: '0.85rem', minWidth: 0 }}>
            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
