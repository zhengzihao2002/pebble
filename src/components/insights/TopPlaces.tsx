'use client';

import { useState } from 'react';
import type { Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { useTranslation } from '@/lib/i18n/useTranslation';

const pad = (n: number) => String(n).padStart(2, '0');
const TOP = 5;

/** Same place, however the bank wrote it: case, spacing and a trailing store number ignored. */
const placeKey = (title: string) => title.toLowerCase().replace(/\s*#?\d{2,}\s*$/, '').replace(/\s+/g, ' ').trim();

/**
 * Where the money went, by place. Pebble has no merchant field, so places are
 * grouped from transaction titles - the card says so. Spending only.
 */
export function TopPlaces({ transactions, today }: { transactions: Transaction[]; today: string | null }) {
  const { d, t } = useTranslation();
  const [range, setRange] = useState<'month' | 'quarter'>('month');
  if (!today) return <section className="card" style={{ padding: '1.25rem 1.5rem', minHeight: 260 }} aria-busy="true" />;

  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const td = Number(today.slice(8, 10));
  const startDate = range === 'month' ? new Date(ty, tm, 1) : new Date(ty, tm - 3, td);
  const start = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;

  const groups = new Map<string, { total: number; count: number; names: Map<string, number> }>();
  for (const x of transactions) {
    if (x.type !== 'expense' || x.amount >= 0 || x.date < start || x.date > today) continue;
    const title = descriptionTitle(x.description).trim();
    const key = placeKey(title);
    if (!key) continue;
    const g = groups.get(key) ?? { total: 0, count: 0, names: new Map<string, number>() };
    g.total += Math.abs(x.amount);
    g.count += 1;
    g.names.set(title, (g.names.get(title) ?? 0) + 1);
    groups.set(key, g);
  }
  const top = [...groups.values()]
    .map((g) => ({ ...g, name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP);
  const max = top[0]?.total ?? 0;

  const tab = (value: 'month' | 'quarter', label: string) => {
    const on = range === value;
    return (
      <button
        type="button" aria-pressed={on} onClick={() => setRange(value)}
        style={{
          padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: on ? 600 : 500, cursor: 'pointer',
          border: `1px solid ${on ? 'var(--pine)' : 'var(--line)'}`, backgroundColor: on ? 'var(--pine-soft)' : 'transparent',
          color: on ? 'var(--pine)' : 'var(--ink-soft)',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem' }} aria-labelledby="pb-places-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 id="pb-places-title" style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.insights.placesTitle}</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.insights.placesHint}</p>
        </div>
        <div role="group" aria-label={d.insights.placesTitle} style={{ display: 'flex', gap: '0.3rem' }}>
          {tab('month', d.insights.thisMonth)}
          {tab('quarter', d.insights.last3)}
        </div>
      </div>

      {top.length === 0 ? (
        <p style={{ margin: '0.9rem 0 0', fontSize: '0.84rem', color: 'var(--ink-soft)' }}>{d.insights.noPlaces}</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: '0.9rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {top.map((p, i) => (
            <li key={p.name}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                <span className="font-mono-tab" style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', width: '1rem' }}>{i + 1}</span>
                {/* Titles are USER DATA and render as stored. */}
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.86rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--ink-soft)' }}>{p.count === 1 ? d.insights.once : t(d.insights.times, { count: p.count })}</span>
                <span className="font-mono-tab" style={{ fontSize: '0.86rem', fontWeight: 600 }}>{formatCurrency(p.total)}</span>
              </div>
              <div aria-hidden="true" style={{ marginTop: 4, marginLeft: '1.6rem', height: 4, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ width: `${max > 0 ? (p.total / max) * 100 : 0}%`, height: '100%', borderRadius: 99, backgroundColor: 'var(--pine)' }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
