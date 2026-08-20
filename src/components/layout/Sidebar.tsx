'use client';

import { Moon, Sun, Banknote } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { NavButton } from './NavButton';
import { SignOutButton } from './SignOutButton';
import { navItems } from './navItems';

export function Sidebar() {
  const darkMode = usePebbleStore((s) => s.darkMode);
  const setDarkMode = usePebbleStore((s) => s.setDarkMode);

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
          <NavButton key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
      </nav>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <button onClick={() => setDarkMode(!darkMode)} className="nav-btn">
          {darkMode ? <Moon size={18} /> : <Sun size={18} />}
          {darkMode ? 'Dark Mode' : 'Light Mode'}
        </button>
        <SignOutButton />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
            ZZ
          </div>
          <div style={{ fontSize: '0.85rem', minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>Zihao Zheng</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>zhengzihao2002@gmail.com</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
