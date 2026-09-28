'use client';

import { Monitor, Moon, Sun, Banknote } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useResolvedDark } from '@/lib/useResolvedDark';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { NavButton } from './NavButton';
import { SignOutButton } from './SignOutButton';
import { navItems } from './navItems';
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

  return (
    <aside className="pebble-sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.5rem', marginBottom: '2rem' }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: 'var(--pine)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Banknote size={17} color="var(--paper)" />
        </div>
        <span className="font-display" style={{ fontSize: '1.35rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Pebble</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {navItems.map((item) => (
          <NavButton key={item.href} href={item.href} icon={item.icon} label={d.nav[item.labelKey]} />
        ))}
      </nav>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <button onClick={() => setAppearance(darkMode ? 'light' : 'dark')} className="nav-btn">
          {onSystem ? <Monitor size={18} /> : darkMode ? <Moon size={18} /> : <Sun size={18} />}
          {onSystem ? d.sidebar.system : darkMode ? d.sidebar.darkMode : d.sidebar.lightMode}
        </button>
        <SignOutButton />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
            {initials}
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
