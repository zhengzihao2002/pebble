'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems } from './navItems';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function BottomNav() {
  const pathname = usePathname();
  const { d } = useTranslation();

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
            <span className="bottom-nav-label" style={{ fontSize: active ? '0.7rem' : '0.63rem' }}>{d.nav[item.labelKey]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
