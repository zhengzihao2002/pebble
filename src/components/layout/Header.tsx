'use client';

import { usePathname } from 'next/navigation';
import { Plus, Bell } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { getGreeting } from '@/lib/format';

interface HeaderProps {
  onAddTransactionClick: () => void;
  onModifyBudgetClick: () => void;
  onAddGoalClick: () => void;
}

interface PageMeta {
  title: string;
  subtitle: string;
  action?: { label: string; kind: 'addTransaction' | 'modifyBudget' | 'addGoal' };
}

export function Header({ onAddTransactionClick, onModifyBudgetClick, onAddGoalClick }: HeaderProps) {
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
    // The goal count is still not shown, and the original reason stands now
    // that the feature has shipped: Header renders inside AppShell, so reading
    // it would cost a database query on EVERY page navigation, not just this
    // page's. The goals page itself shows the counts that matter.
    '/goals': { title: 'Goals', subtitle: 'Money set aside for what is next', action: { label: 'Add goal', kind: 'addGoal' } },
    '/settings': { title: 'Settings', subtitle: 'Manage your preferences' },
  };

  const current = pageMeta[pathname] ?? pageMeta['/dashboard'];
  const handleActionClick = current.action?.kind === 'addTransaction' ? onAddTransactionClick
    : current.action?.kind === 'modifyBudget' ? onModifyBudgetClick
    : current.action?.kind === 'addGoal' ? onAddGoalClick
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
