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

/**
 * The four that stay visible in the mobile bar; the rest live behind "More".
 *
 * WHY A FIXED FOUR. The bar used to hold all eight with overflow-x: auto, so
 * reaching the later items meant swiping horizontally at the very bottom edge
 * of the screen - which on iOS is the app-switcher gesture. Users ended up in
 * another app instead of another page. Nothing scrolls now, so nothing
 * competes with the OS.
 *
 * Order here is the order in the bar. Changing which four are primary is a
 * one-line edit; nothing else reads this.
 */
export const PRIMARY_NAV_HREFS: readonly string[] = [
  '/dashboard',
  '/transactions',
  '/reports',
  '/settings',
];

export const primaryNavItems = navItems.filter((i) => PRIMARY_NAV_HREFS.includes(i.href));
export const secondaryNavItems = navItems.filter((i) => !PRIMARY_NAV_HREFS.includes(i.href));

/**
 * Settings stays lit while the user is in the Better Auth account views.
 * /account/* renders inside AppShell and is only reachable from the Settings
 * page, so exact-match highlighting left the nav looking broken there.
 *
 * Shared by NavButton and BottomNav so the sidebar and the mobile bar cannot
 * disagree about which item is active.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/settings') {
    return pathname === '/settings' || pathname.startsWith('/account/');
  }
  return pathname === href;
}
