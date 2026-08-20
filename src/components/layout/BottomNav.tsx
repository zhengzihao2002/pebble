'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems } from './navItems';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pebble-bottom-nav">
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href} href={item.href}
            className={`bottom-nav-btn ${active ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <item.icon size={20} className={`bottom-nav-icon ${active ? 'active' : ''}`} />
            <span className="bottom-nav-label" style={{ fontSize: active ? '0.7rem' : '0.63rem' }}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
