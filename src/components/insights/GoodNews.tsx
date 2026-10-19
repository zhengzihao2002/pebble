'use client';

import { Sparkles } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Insight } from './insightRules';
import { Note } from './WorthKnowing';

/**
 * NEW home for the positive and neutral notes (no-spend days, below usual,
 * scheduled payments per year): they used to sit at the very end of the one
 * long Worth knowing list, after every warning. Same rules, ids, actions and
 * dismissal; shown as a row of small cards - a sideways scroller on a phone,
 * a grid on wider screens. Hidden when there is nothing to celebrate.
 */
export function GoodNews({ items, pending, onHide, onUndo }: {
  items: Insight[];
  pending: string[];
  onHide: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const { d } = useTranslation();
  const ux = d.ux.insights;
  if (items.length === 0) return null;
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
