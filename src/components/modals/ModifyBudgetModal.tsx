'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getBudgetModalDataAction, modifyBudgetsAction } from '@/lib/actions/pebble';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency } from '@/lib/format';

interface ModifyBudgetModalProps {
  onClose: () => void;
}

export function ModifyBudgetModal({ onClose }: ModifyBudgetModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [annualIncome, setAnnualIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Budgets are loaded on open rather than fetched by the layout: this modal
  // is mounted in AppShell, so a layout-level fetch would run on every page
  // navigation for data that is usually never displayed.
  useEffect(() => {
    let active = true;
    getBudgetModalDataAction().then((result) => {
      if (!active) return;
      if (!result.ok) { setError(result.error); setLoading(false); return; }
      const meta = buildCategoryMeta(result.budgets);
      const initial: Record<string, string> = {};
      Object.entries(meta).forEach(([name, entry]) => {
        initial[name] = entry.budget > 0 ? String(entry.budget) : '';
      });
      setValues(initial);
      setAnnualIncome(result.annualIncome);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const categoryMeta = buildCategoryMeta({});
  const categoryNames = Object.keys(categoryMeta);
  const totalBudgeted = categoryNames.reduce((s, name) => s + (Number(values[name]) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || loading) return;
    const budgets: Record<string, number> = {};
    categoryNames.forEach((name) => { budgets[name] = Number(values[name]) || 0; });
    setSaving(true);
    setError(null);
    const result = await modifyBudgetsAction(budgets);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
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
                      type="number" min="0" step="1" placeholder="0" value={values[name] ?? ''} disabled={loading}
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

          {error && (
            <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginTop: '0.9rem', marginBottom: 0 }}>{error}</p>
          )}

          <button type="submit" disabled={loading || saving} className="btn-primary" style={{ marginTop: '1.25rem', padding: '0.75rem', width: '100%', opacity: loading || saving ? 0.6 : 1 }}>
            {loading ? 'Loading…' : saving ? 'Saving…' : 'Save budgets'}
          </button>
        </form>
      </div>
    </div>
  );
}
