'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { isNavItemActive } from './navItems';

interface NavButtonProps {
  href: string;
  icon: LucideIcon;
  label: string;
}

export function NavButton({ href, icon: Icon, label }: NavButtonProps) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, href);

  // Automatic prefetching is deliberately off for internal links. On an idle
  // tab it re-requested every route every few minutes, and each request ran
  // the session check, which can reach the auth service and the database.
  return (
    <Link href={href} prefetch={false} className={`nav-btn ${active ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
      <Icon size={18} strokeWidth={2} className={`nav-icon ${active ? 'active' : ''}`} />
      <span className="nav-label" style={{ fontSize: active ? '0.96rem' : '0.9rem' }}>{label}</span>
    </Link>
  );
}
