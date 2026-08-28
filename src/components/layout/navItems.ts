import { LayoutDashboard, Receipt, BarChart3, LineChart, PiggyBank, Target, CalendarClock, Settings as SettingsIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';

/**
 * Carries a KEY, not a label.
 *
 * This module has no 'use client' and is imported by both Sidebar and
 * BottomNav, so it cannot call a hook - there is nowhere here to read the
 * locale from. Each consumer holds the dictionary already (it renders the
 * text) and resolves d.nav[item.labelKey] itself.
 *
 * Typed against the dictionary rather than as a plain string so a key that
 * does not exist is a compile error. `import type` erases at build time, so
 * naming the Dictionary here pulls no strings into the bundle.
 */
export interface NavItem {
  href: string;
  labelKey: keyof Dictionary['nav'];
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/transactions', labelKey: 'transactions', icon: Receipt },
  { href: '/reports', labelKey: 'reports', icon: BarChart3 },
  { href: '/analysis', labelKey: 'analysis', icon: LineChart },
  { href: '/budgets', labelKey: 'budgets', icon: PiggyBank },
  { href: '/goals', labelKey: 'goals', icon: Target },
  { href: '/scheduled', labelKey: 'scheduled', icon: CalendarClock },
  { href: '/settings', labelKey: 'settings', icon: SettingsIcon },
];
