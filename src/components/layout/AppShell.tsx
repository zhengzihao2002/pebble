'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { AddTransactionModal } from '@/components/modals/AddTransactionModal';
import { ModifyBudgetModal } from '@/components/modals/ModifyBudgetModal';
import { GoalModal } from '@/components/modals/GoalModal';

export function AppShell({ children }: { children: ReactNode }) {
  const darkMode = usePebbleStore((s) => s.darkMode);
  const textSize = usePebbleStore((s) => s.textSize);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showModifyBudgetModal, setShowModifyBudgetModal] = useState(false);
  // Mounted here rather than on the goals page because its trigger lives in
  // Header, which AppShell renders. This is also why every mutation calls
  // revalidatePath(route, 'layout') - a page-scoped revalidate would not reach
  // a modal that lives above the page.
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);

  // Same effect the original top-level App component had: text-size
  // setting scales the document's root font size, which every rem-based
  // measurement throughout Pebble is relative to.
  useEffect(() => {
    document.documentElement.style.fontSize = `${(textSize / 100) * 16}px`;
  }, [textSize]);

  // Mirrors darkMode onto <html> so the class the pre-paint script set stays
  // truthful after a toggle. .pebble-root also carries it (see globals.css) -
  // this keeps the two in step rather than replacing either.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Releases the transition freeze one frame after mount. Waiting for a frame
  // rather than clearing it immediately means any hydration-time class change
  // has already painted, so nothing left to animate is still pending.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-theme-transition');
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`pebble-root themed-scroll ${darkMode ? 'dark' : ''}`}>
      <div className="pebble-shell">
        <Sidebar />
        <div className="pebble-main-content">
          <Header
            onAddTransactionClick={() => setShowAddModal(true)}
            onModifyBudgetClick={() => setShowModifyBudgetModal(true)}
            onAddGoalClick={() => setShowAddGoalModal(true)}
          />
          <main className="pebble-main">{children}</main>
        </div>
        <BottomNav />
      </div>

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
      {showModifyBudgetModal && <ModifyBudgetModal onClose={() => setShowModifyBudgetModal(false)} />}
      {showAddGoalModal && <GoalModal onClose={() => setShowAddGoalModal(false)} />}
    </div>
  );
}
