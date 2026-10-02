'use client';

import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { BudgetEntry } from './types';

/** Categories with spending this year but no budget. Quiet by design: not an overspend. Names are user data. */
export function UnbudgetedList({ entries }: { entries: BudgetEntry[] }) {
  const { d } = useTranslation();
  const rows = entries.filter((e) => e.budget === 0 && e.spent > 0).sort((a, b) => b.spent - a.spent);
  if (rows.length === 0) return null;
  return (
    <div className="card pb-unb">
      <h3 className="pb-stats-title">{d.budgetPlan.unbudgetedTitle}</h3>
      <ul className="pb-unb-list">
        {rows.map((e) => {
          const Icon = e.icon;
          return (
            <li key={e.name} className="pb-unb-row">
              <span className="pb-budget-icon" style={{ backgroundColor: `${e.color}20` }}>
                <Icon size={15} style={{ color: e.color }} />
              </span>
              <span className="pb-unb-name">{e.name}</span>
              <span className="font-mono-tab pb-unb-amount">{formatCurrency(e.spent)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
