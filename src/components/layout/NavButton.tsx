'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

interface NavButtonProps {
  href: string;
  icon: LucideIcon;
  label: string;
}

export function NavButton({ href, icon: Icon, label }: NavButtonProps) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link href={href} className={`nav-btn ${active ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
      <Icon size={18} strokeWidth={2} className={`nav-icon ${active ? 'active' : ''}`} />
      <span className="nav-label" style={{ fontSize: active ? '0.96rem' : '0.9rem' }}>{label}</span>
    </Link>
  );
}
