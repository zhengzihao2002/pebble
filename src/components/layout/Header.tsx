'use client';

import { usePathname } from 'next/navigation';
import { Plus, Bell } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { getGreeting } from '@/lib/format';

interface HeaderProps {
  onAddTransactionClick: () => void;
  onModifyBudgetClick: () => void;
}

interface PageMeta {
  title: string;
  subtitle: string;
  action?: { label: string; kind: 'addTransaction' | 'modifyBudget' };
}

export function Header({ onAddTransactionClick, onModifyBudgetClick }: HeaderProps) {
  const pathname = usePathname();
  const { name, isPending } = useCurrentUser();

  const firstName = !isPending && name ? name.trim().split(/\s+/)[0] : '';
  const greeting = firstName ? `${getGreeting()}, ${firstName}` : getGreeting();

  // Same shape as the original's pageMeta/headerActions objects, just
  // keyed by route instead of activeView string. Recomputed every render
  // so getGreeting() stays live, same as the original.
  const pageMeta: Record<string, PageMeta> = {
    '/dashboard': { title: 'Dashboard', subtitle: greeting, action: { label: 'Add transaction', kind: 'addTransaction' } },
    '/transactions': { title: 'Transactions', subtitle: 'Checking & Cash statements', action: { label: 'Add transaction', kind: 'addTransaction' } },
    '/reports': { title: 'Reports', subtitle: 'Filter and group your expenses and income' },
    '/budgets': { title: 'Budgets', subtitle: 'This year', action: { label: 'Modify Budget', kind: 'modifyBudget' } },
    // The goal count is intentionally not shown. Header is rendered inside
    // AppShell (the layout), so reading it would mean a database query on
    // every page navigation - to label a page that is gated behind a
    // Coming Soon overlay and has no way to create a goal. Wire this up
    // when the Goals feature actually ships.
    '/goals': { title: 'Goals', subtitle: 'Coming soon' },
    '/settings': { title: 'Settings', subtitle: 'Manage your preferences' },
  };

  const current = pageMeta[pathname] ?? pageMeta['/dashboard'];
  const handleActionClick = current.action?.kind === 'addTransaction' ? onAddTransactionClick
    : current.action?.kind === 'modifyBudget' ? onModifyBudgetClick
    : undefined;

  return (
    <header className="pebble-header" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.title}</h1>
          <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          {current.action && handleActionClick && (
            <button onClick={handleActionClick} className="btn-primary">
              <Plus size={16} /> <span className="add-btn-label">{current.action.label}</span>
            </button>
          )}
          <button className="icon-btn" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }}>
            <Bell size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
