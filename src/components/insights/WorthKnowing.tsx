'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, Lightbulb, Sparkles, X } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { Skeleton } from '@/components/kit/Skeleton';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useElementSize } from './hooks';
import type { Insight } from './insightRules';

// The rules and their types live in insightRules.tsx; re-exported so the
// existing `import { SchedulePrefill } from './WorthKnowing'` keeps working.
export type { SchedulePrefill, Insight, InsightGroup } from './insightRules';

/**
 * Rows shown before "Show n more": three in one column, four once the card
 * is wide enough for two columns (an even count, so no half-empty last row).
 */
const FIRST = 3;
const FIRST_WIDE = 4;
/** The card's own width from which its notes sit in two columns (insights.css). */
const WIDE_CARD = 720;

interface NoteProps {
  item: Insight;
  /** Beyond the first few: hidden until "Show n more" (except in the rail). */
  extra?: boolean;
  pending: boolean;
  onHide: (id: string) => void;
  onUndo: (id: string) => void;
}

/**
 * One note: tone-coloured tile and title, the sentence (names framed as
 * .pb-wk-name chips; the line blurs in privacy mode since it carries
 * amounts), its one action, and "Not useful". Hiding swaps the row for a
 * short "Hidden · Undo" line; the store is only told once that window ends
 * (useDismissQueue), so a mis-tap is recoverable.
 */
export function Note({ item: i, extra = false, pending, onHide, onUndo }: NoteProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.insights;
  const undoRef = useRef<HTMLButtonElement>(null);
  const xRef = useRef<HTMLButtonElement>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const wasPending = useRef(false);
  const cardRef = useRef<HTMLElement | null>(null);
  // Focus follows the dismissal to Undo, so a keyboard user is not dropped
  // at the top of the page when the X button disappears; after Undo it goes
  // back to this row's X (only if focus was lost with the Undo button).
  useEffect(() => {
    cardRef.current = liRef.current?.closest('section') ?? cardRef.current;
    if (pending) {
      wasPending.current = true;
      undoRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost) xRef.current?.focus({ preventScroll: true });
  }, [pending]);
  // When the dismissal commits the row leaves the list; if that dropped
  // focus, move it to the next note's X, or the list heading if none is left.
  useEffect(() => () => {
    if (!wasPending.current) return;
    const card = cardRef.current;
    requestAnimationFrame(() => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (!lost || !card || !card.isConnected) return;
      const next = card.querySelector<HTMLElement>('.pb-ins-note-x');
      if (next) { next.focus({ preventScroll: true }); return; }
      const head = card.querySelector<HTMLElement>('#pb-worth-title');
      if (head) { head.tabIndex = -1; head.focus({ preventScroll: true }); }
    });
  }, []);

  if (pending) {
    return (
      <li ref={liRef} className={`pb-ins-note pb-ins-note-hidden${extra ? ' pb-ins-wk-extra' : ''}`} role="status">
        <span className="pb-ins-note-hidden-text">{t(ux.hiddenNote, { title: i.title })}</span>
        <button ref={undoRef} type="button" className="link-btn pb-ins-undo" onClick={() => onUndo(i.id)}>{ux.undo}</button>
      </li>
    );
  }
  const Icon = i.icon;
  return (
    <li ref={liRef} className={`pb-ins-note goal-step${i.group === 'urgent' ? ' is-urgent' : ''}${extra ? ' pb-ins-wk-extra' : ''}`} style={{ ['--pb-tone' as string]: i.tone }}>
      <span className="pb-ins-note-icon" aria-hidden="true"><Icon size={i.group === 'urgent' ? 18 : 16} /></span>
      <span className="pb-ins-note-main">
        <span className="pb-ins-note-title">{i.title}</span>
        {/* Names are USER DATA. Amounts are inside, so the line blurs in privacy mode. */}
        <span className="pb-money pb-ins-note-body">{i.body}</span>
        {i.action && (
          <span className="pb-ins-note-action">
            {i.action.href ? (
              <Link href={i.action.href} prefetch={false} className="pill">{i.action.label}</Link>
            ) : (
              <button type="button" className="pill" onClick={i.action.onClick}>{i.action.label}</button>
            )}
          </span>
        )}
      </span>
      {/* 30px to the eye, a 44px target (insights.css) - it was 30x30. */}
      <button
        ref={xRef} type="button" className="icon-btn pb-ins-note-x" onClick={() => onHide(i.id)}
        aria-label={d.insights.dismiss} title={d.insights.dismiss}
      >
        <X size={15} />
      </button>
    </li>
  );
}

interface ListProps {
  /** The page's notes, already without dismissed ones; null while today resolves. */
  items: Insight[] | null;
  pending: string[];
  onHide: (id: string) => void;
  onUndo: (id: string) => void;
}

/**
 * "Worth knowing", attention first. The notes that want action are split
 * into "Needs attention" (card overdue or due within a day, possible
 * duplicates) and "Worth a look" (everything else that may need a decision),
 * each with a count; the positive notes go to the Good news strip. Order
 * inside each group is the rules' own order - card reminders still lead.
 *
 * Always collapsed to the first few with "Show n more". It used to be a
 * sticky rail beside the hero and calendar on a wide Mac; being taller than
 * the rows it sat beside, it slid under the cards below it as the page
 * scrolled (owner report). It is now a normal full-width card under the
 * hero - what needs attention, first - with its notes in two columns when
 * the card is wide, so it never leaves a hole or overlaps anything.
 */
export function WorthKnowing({ items, pending, onHide, onUndo }: ListProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.insights;
  const [expanded, setExpanded] = useState(false);
  // Width is measured, not guessed: the first frame is the one-column list
  // (width 0), so server and client agree, and two columns follow at once.
  const [cardRef, card] = useElementSize<HTMLElement>();
  const first = card.width >= WIDE_CARD ? FIRST_WIDE : FIRST;

  if (!items) {
    return (
      <section className="card pb-ins-card pb-ins-wk" aria-labelledby="pb-worth-title" aria-busy="true">
        <SectionHeader id="pb-worth-title" icon={Lightbulb} title={d.insights.wkTitle} subtitle={d.insights.wkHint} />
        <div className="pb-ins-skel-rows" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="pb-ins-skel-row">
              <Skeleton width={34} height={34} radius="0.65rem" />
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <Skeleton width="38%" height="0.7rem" />
                <Skeleton width={`${86 - n * 10}%`} height="0.85rem" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const urgent = items.filter((i) => i.group === 'urgent');
  const review = items.filter((i) => i.group === 'review');
  const live = (list: Insight[]) => list.filter((i) => !pending.includes(i.id)).length;
  const count = live(urgent) + live(review);
  const total = urgent.length + review.length;
  const extra = Math.max(0, total - first);

  // Index across both groups, so "first few" means the most urgent ones.
  let n = 0;
  const group = (list: Insight[], label: string, key: string) => list.length === 0 ? null : (
    <div className="pb-ins-wk-group" data-group={key}>
      <p className="pb-ins-wk-grouphead">
        <span>{label}</span>
        <span className="pb-ins-wk-count pb-tnum">{live(list)}</span>
      </p>
      <ul className="pb-ins-notes">
        {list.map((i) => {
          const isExtra = n++ >= first && !expanded;
          return <Note key={i.id} item={i} extra={isExtra} pending={pending.includes(i.id)} onHide={onHide} onUndo={onUndo} />;
        })}
      </ul>
    </div>
  );

  return (
    <section ref={cardRef} className="card pb-ins-card pb-ins-wk" aria-labelledby="pb-worth-title">
      <SectionHeader
        id="pb-worth-title" icon={Lightbulb} title={d.insights.wkTitle} subtitle={d.insights.wkHint}
        actions={
          <span className={`pb-ins-wk-badge pb-tnum${count === 0 ? ' is-clear' : ''}`}>
            {count === 0 ? <><Sparkles size={12} aria-hidden="true" />{ux.allClear}</> : t(ux.attentionCount, { count })}
          </span>
        }
      />
      {total === 0 ? (
        // The all-clear is the page's standing answer for notes that are
        // naturally absent when nothing is wrong; its line says what would
        // appear, so a new account knows these checks exist.
        <EmptyState compact icon={CheckCircle2} title={d.insights.wkEmpty} body={ux.wkEmptyBody} />
      ) : (
        <div className="pb-ins-wk-scroll">
          {group(urgent, ux.needsAttention, 'urgent')}
          {group(review, ux.toReview, 'review')}
        </div>
      )}
      {extra > 0 && (
        <button
          type="button" className="link-btn pb-ins-more pb-ins-wk-toggle"
          aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? ux.showFewer : t(ux.showMoreCount, { count: extra })}
          <ChevronDown size={14} aria-hidden="true" className={expanded ? 'is-up' : undefined} />
        </button>
      )}
    </section>
  );
}
