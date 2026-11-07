'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { modifyBudgetsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { AmountInput } from '@/components/shared/AmountInput';

export const budgetIconBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%', border: 'none', padding: 0, verticalAlign: 'middle',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

/**
 * Inline yearly budget editor for one category, shared by every row on the
 * Budgets page. Shows the monthly equivalent live as you type, as the old
 * Modify budget dialog did. Saves ONE category through the existing
 * modifyBudgetsAction, which only touches the categories it is given (0
 * removes the budget). Whole dollars, arithmetic allowed, Enter saves,
 * Escape cancels.
 */
export function InlineBudgetEditor({ name, initial, onClose }: { name: string; initial: string; onClose: () => void }) {
  const { d, t, locale } = useTranslation();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(value);

  const cancel = () => { if (!saving) onClose(); };
  const save = async () => {
    if (saving) return;
    if (value.trim() === '' || !Number.isFinite(amount) || amount < 0) return;
    setSaving(true);
    setError(null);
    const result = await callAction(() => modifyBudgetsAction({ [name]: amount }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); return; }
    onClose();
  };

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
          else if (e.key === 'Enter') { e.preventDefault(); void save(); }
        }}
      >
        <span style={{ position: 'relative', display: 'inline-block', width: '7rem' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }}>$</span>
          <AmountInput
            wholeDollars autoFocus value={value} onValueChange={setValue} disabled={saving}
            aria-label={`${d.budgetEdit.edit}: ${name}`} className="font-mono-tab"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.35rem 0.45rem 0.35rem 1.2rem', borderRadius: '0.45rem', border: '1px solid var(--line)', fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)' }}
          />
        </span>
        <button type="button" className="icon-btn" onClick={() => void save()} disabled={saving} aria-label={d.budgetEdit.save} title={d.budgetEdit.save} style={{ ...budgetIconBtn, color: 'var(--pine)' }}><Check size={18} /></button>
        <button type="button" className="icon-btn" onClick={cancel} disabled={saving} aria-label={d.budgetEdit.cancel} title={d.budgetEdit.cancel} style={budgetIconBtn}><X size={18} /></button>
      </span>
      {Number.isFinite(amount) && amount > 0 && (
        <span className="font-mono-tab" style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
          {t(d.budgetModal.estMonthlyLabel, { amount: formatCurrency(amount / 12) })}
        </span>
      )}
      {error && <span role="status" style={{ fontSize: '0.75rem', color: 'var(--wine)' }}>{error}</span>}
    </span>
  );
}
