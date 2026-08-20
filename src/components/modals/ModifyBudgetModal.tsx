'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { usePebbleStore, useTransactions } from '@/store/usePebbleStore';
import { estimateAnnualIncome } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';

interface ModifyBudgetModalProps {
  onClose: () => void;
}

export function ModifyBudgetModal({ onClose }: ModifyBudgetModalProps) {
  const categoryMeta = usePebbleStore((s) => s.categoryMeta);
  const modifyBudgets = usePebbleStore((s) => s.modifyBudgets);
  const transactions = useTransactions();

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.entries(categoryMeta).forEach(([name, meta]) => {
      initial[name] = meta.budget > 0 ? String(meta.budget) : '';
    });
    return initial;
  });

  const annualIncome = estimateAnnualIncome(transactions);
  const categoryNames = Object.keys(categoryMeta);
  const totalBudgeted = categoryNames.reduce((s, name) => s + (Number(values[name]) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const budgets: Record<string, number> = {};
    categoryNames.forEach((name) => { budgets[name] = Number(values[name]) || 0; });
    modifyBudgets(budgets);
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 680, boxSizing: 'border-box', margin: '1rem 0' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.3rem', fontWeight: 600 }}>Modify budget</h2>
          <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', marginBottom: '1.25rem' }}>
          Set an annual budget for each category. Leave a box blank for no budget — that category stays hidden on the Budgets page until you spend something in it.
        </p>

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', boxShadow: 'none', backgroundColor: 'var(--paper)' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Estimated annual income</p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(annualIncome)}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>Based on your Standard Income history</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Total budgeted</p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600, color: annualIncome > 0 && totalBudgeted > annualIncome ? 'var(--wine)' : 'var(--ink)' }}>
              {formatCurrency(totalBudgeted)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="themed-scroll" style={{ maxHeight: '48vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {categoryNames.map((name) => {
              const meta = categoryMeta[name];
              return (
                <div key={name} className="budget-modify-row">
                  <span className="budget-modify-label">
                    <meta.icon size={16} style={{ color: meta.color, flexShrink: 0 }} />
                    {name}
                  </span>
                  <div className="budget-modify-input-wrap">
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>$</span>
                    <input
                      type="number" min="0" step="1" placeholder="0" value={values[name]}
                      onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                      className="font-mono-tab"
                      style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' }}
                    />
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>/ yr</span>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: '1.25rem', padding: '0.75rem', width: '100%' }}>
            Save budgets
          </button>
        </form>
      </div>
    </div>
  );
}
