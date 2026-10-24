'use client';

import { Sparkles } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Insight } from './insightRules';
import { AddTransactionAction } from './AddTransactionAction';
import { Note } from './WorthKnowing';

/**
 * NEW home for the positive and neutral notes (no-spend days, below usual,
 * scheduled payments per year): they used to sit at the very end of the one
 * long Worth knowing list, after every warning. Same rules, ids, actions and
 * dismissal; shown as a row of small cards - a sideways scroller on a phone,
 * a grid on wider screens. With nothing to celebrate yet the card stays, with
 * what would fill it (a new account sees the same sections as a loaded one).
 */
export function GoodNews({ items, pending, onHide, onUndo }: {
  items: Insight[];
  pending: string[];
  onHide: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const { d } = useTranslation();
  const ux = d.ux.insights;
  if (items.length === 0) {
    return (
      <section className="card pb-ins-card pb-ins-good" aria-labelledby="pb-good-title">
        <SectionHeader id="pb-good-title" icon={Sparkles} title={ux.goodNews} subtitle={ux.goodNewsHint} />
        <EmptyState compact icon={Sparkles} title={ux.goodNeedsTitle} body={ux.goodNeedsBody} action={<AddTransactionAction />} />
      </section>
    );
  }
  const live = items.filter((i) => !pending.includes(i.id)).length;
  return (
    <section className="card pb-ins-card pb-ins-good" aria-labelledby="pb-good-title">
      <SectionHeader
        id="pb-good-title" icon={Sparkles} title={ux.goodNews} subtitle={ux.goodNewsHint}
        actions={<span className="pb-ins-wk-badge is-clear pb-tnum">{live}</span>}
      />
      <ul className="pb-ins-notes pb-ins-good-list">
        {items.map((i) => (
          <Note key={i.id} item={i} pending={pending.includes(i.id)} onHide={onHide} onUndo={onUndo} />
        ))}
      </ul>
    </section>
  );
}
