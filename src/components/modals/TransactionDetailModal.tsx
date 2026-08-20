'use client';

import { useEffect } from 'react';
import { Banknote, X } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, parseLocalDate } from '@/lib/format';

interface TransactionDetailModalProps {
  txn: Transaction | null;
  onClose: () => void;
  categoryMeta: CategoryMeta;
}

export function TransactionDetailModal({ txn, onClose, categoryMeta }: TransactionDetailModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!txn) return null;
  const meta = categoryMeta[txn.category];
  const Icon = meta ? meta.icon : Banknote;
  const isIncome = txn.amount > 0;
  const iconColor = isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)');
  const iconBg = isIncome ? 'var(--pine-soft)' : `${meta ? meta.color : '#999999'}20`;

  const rows = [
    { label: 'Type', value: isIncome ? 'Income' : 'Expense' },
    { label: 'Category', value: txn.category },
    ...(txn.type === 'expense' && txn.tag ? [{ label: 'Tag / sub-category', value: txn.tag }] : []),
    { label: 'Date', value: parseLocalDate(txn.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
    { label: 'Payment method', value: txn.paymentMethod || '—' },
    ...(txn.type === 'income' ? [
      { label: 'Pay before deductions', value: formatCurrency(txn.grossAmount) },
      { label: 'Pay after deductions', value: formatCurrency(txn.netAmount) },
    ] : []),
  ];

  const descLines = txn.description.split('\n');
  const descTitle = descLines[0];
  const descRest = descLines.slice(1).join('\n').trim();

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
          <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none' }}><X size={18} /></button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: '0.9rem', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.85rem' }}>
            <Icon size={24} style={{ color: iconColor }} />
          </div>
          <p style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: descRest ? '0.2rem' : '0.35rem' }}>{descTitle}</p>
          {descRest && (
            <p style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--ink-soft)', marginBottom: '0.35rem', whiteSpace: 'pre-line' }}>{descRest}</p>
          )}
          <p className="font-display" style={{ fontSize: '2rem', fontWeight: 600, color: isIncome ? 'var(--pine)' : 'var(--wine)', marginTop: '0.3rem' }}>
            {isIncome ? '+' : ''}{formatCurrency(txn.amount)}
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--ink-soft)' }}>{r.label}</span>
              <span className="font-mono-tab" style={{ fontWeight: 500, textAlign: 'right' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
