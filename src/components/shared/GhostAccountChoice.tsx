'use client';

import { Ghost } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** Explicit, per-dialog opt-in. This choice is intentionally never persisted. */
export function GhostAccountChoice({ checked, onChange, ghostSelected = false }: {
  checked: boolean; onChange: (checked: boolean) => void; ghostSelected?: boolean;
}) {
  const { locale } = useTranslation();
  return <div style={{ display: 'grid', gap: '.35rem', fontSize: '.78rem', lineHeight: 1.45, color: 'var(--ink-soft)', marginTop: '.35rem' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', minHeight: '2rem' }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} style={{ margin: 0, accentColor: 'var(--pine)' }} />
      <Ghost size={14} aria-hidden="true" />
      <span>{locale === 'zh' ? '显示幽灵账户' : 'Show ghost accounts'}</span>
    </label>
    {ghostSelected && <span>{locale === 'zh' ? '此账户的活动仅计入它自己的记录，不计入总余额、收支或预算。' : 'Activity stays in this account’s own ledger, outside total balances, income, spending and budgets.'}</span>}
  </div>;
}

export function ghostAccountLabel(name: string, isGhost: boolean | undefined, locale: string) {
  return isGhost ? `${name} · ${locale === 'zh' ? '幽灵' : 'Ghost'}` : name;
}
