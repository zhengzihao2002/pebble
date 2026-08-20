'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { AddTransactionModal } from '@/components/modals/AddTransactionModal';
import { ModifyBudgetModal } from '@/components/modals/ModifyBudgetModal';

export function AppShell({ children }: { children: ReactNode }) {
  const darkMode = usePebbleStore((s) => s.darkMode);
  const textSize = usePebbleStore((s) => s.textSize);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showModifyBudgetModal, setShowModifyBudgetModal] = useState(false);

  // Same effect the original top-level App component had: text-size
  // setting scales the document's root font size, which every rem-based
  // measurement throughout Pebble is relative to.
  useEffect(() => {
    document.documentElement.style.fontSize = `${(textSize / 100) * 16}px`;
  }, [textSize]);

  return (
    <div className={`pebble-root themed-scroll ${darkMode ? 'dark' : ''}`}>
      <div className="pebble-shell">
        <Sidebar />
        <div className="pebble-main-content">
          <Header
            onAddTransactionClick={() => setShowAddModal(true)}
            onModifyBudgetClick={() => setShowModifyBudgetModal(true)}
          />
          <main className="pebble-main">{children}</main>
        </div>
        <BottomNav />
      </div>

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
      {showModifyBudgetModal && <ModifyBudgetModal onClose={() => setShowModifyBudgetModal(false)} />}
    </div>
  );
}
