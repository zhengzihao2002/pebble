import { LayoutDashboard, Receipt, BarChart3, PiggyBank, Target, CalendarClock, Settings as SettingsIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/scheduled', label: 'Scheduled', icon: CalendarClock },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];
