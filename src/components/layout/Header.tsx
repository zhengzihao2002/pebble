'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus, ArrowRightLeft, X } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { getGreetingKey } from '@/lib/format';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface HeaderProps {
  onAddTransactionClick: () => void;
  onModifyBudgetClick: () => void;
  onAddGoalClick: () => void;
  onAddScheduleClick: () => void;
  onTransferClick: () => void;
}

interface PageMeta {
  title: string;
  subtitle: string;
  action?: { label: string; kind: 'addTransaction' | 'modifyBudget' | 'addGoal' | 'addSchedule' };
  /**
   * A second, lower-weight action rendered as a pill beside the primary
   * button. Separate from `action` rather than making it an array: the two
   * carry different visual weight, which an array would flatten.
   */
  secondaryAction?: { label: string; kind: 'transfer' };
}

export function Header({ onAddTransactionClick, onModifyBudgetClick, onAddGoalClick, onAddScheduleClick, onTransferClick }: HeaderProps) {
  const pathname = usePathname();
  const { name, isPending } = useCurrentUser();
  const { d, t } = useTranslation();

  const firstName = !isPending && name ? name.trim().split(/\s+/)[0] : '';

  // Zone-aware and hydration-safe, mirroring AnalysisClient's `today` state:
  // starts null so the server render and first client render match exactly,
  // then resolves in a mount effect from the stored override, falling back
  // to the browser's own live zone - the same order used everywhere else
  // client-side "today" is computed. A brief blank subtitle before the
  // effect runs is the same tradeoff AnalysisClient already makes.
  // Collapsed by default: two labelled buttons plus the bell overflowed
  // 375px and pushed the page title under an ellipsis. One icon expands into
  // the choices instead.
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Fixed positioning needs real coordinates, measured from the toggle on open
  // and kept in step with scroll and resize.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const measure = () => {
      const el = actionsRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [actionsOpen]);

  // Click-away and Escape. Without these the expanded row stays open while the
  // user is doing something else, which is how it ends up covering the title
  // it was meant to make room for.
  useEffect(() => {
    if (!actionsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!actionsRef.current?.contains(e.target as Node)) setActionsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setActionsOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [actionsOpen]);

  // Navigating between pages must not leave it open - the actions differ per
  // page, and a stale expanded row would offer the wrong ones.
  useEffect(() => { setActionsOpen(false); }, [pathname]);

  const timeZoneOverride = useTimeZoneOverride();
  const [greetingKey, setGreetingKey] = useState<'morning' | 'afternoon' | 'evening' | null>(null);

  useEffect(() => {
    const zone = timeZoneOverride ?? resolveBrowserTimeZone();
    setGreetingKey(getGreetingKey(zone));
  }, [timeZoneOverride]);

  // Interpolated, not concatenated. The separator was a hardcoded ', ' and
  // Chinese needs a fullwidth comma, so it lives in the dictionary now.
  const greeting = greetingKey
    ? (firstName
        ? t(d.header.greetingWithName, { greeting: d.header.greeting[greetingKey], name: firstName })
        : d.header.greeting[greetingKey])
    : '';

  // Recomputed every render so the greeting stays live, same as before.
  //
  // Titles come from d.nav rather than a parallel header.titles block: they
  // are the same words as the sidebar labels, and one entry means the two
  // cannot drift apart.
  const pageMeta: Record<string, PageMeta> = {
    '/dashboard': { title: d.nav.dashboard, subtitle: greeting, action: { label: d.header.addTransaction, kind: 'addTransaction' }, secondaryAction: { label: d.transfer.title, kind: 'transfer' } },
    '/transactions': { title: d.nav.transactions, subtitle: d.header.subtitles.transactions, action: { label: d.header.addTransaction, kind: 'addTransaction' }, secondaryAction: { label: d.transfer.title, kind: 'transfer' } },
    '/reports': { title: d.nav.reports, subtitle: d.header.subtitles.reports },
    '/analysis': { title: d.nav.analysis, subtitle: d.header.subtitles.analysis },
    '/budgets': { title: d.nav.budgets, subtitle: d.header.subtitles.budgets, action: { label: d.header.modifyBudget, kind: 'modifyBudget' } },
    // The goal count is still not shown, and the original reason stands now
    // that the feature has shipped: Header renders inside AppShell, so reading
    // it would cost a database query on EVERY page navigation, not just this
    // page's. The goals page itself shows the counts that matter.
    '/goals': { title: d.nav.goals, subtitle: d.header.subtitles.goals, action: { label: d.common.addGoal, kind: 'addGoal' } },
    '/scheduled': { title: d.nav.scheduled, subtitle: d.header.subtitles.scheduled, action: { label: d.header.addSchedule, kind: 'addSchedule' } },
    '/settings': { title: d.nav.settings, subtitle: d.header.subtitles.settings },
  };

  const current = pageMeta[pathname] ?? pageMeta['/dashboard'];
  const handleActionClick = current.action?.kind === 'addTransaction' ? onAddTransactionClick
    : current.action?.kind === 'modifyBudget' ? onModifyBudgetClick
    : current.action?.kind === 'addGoal' ? onAddGoalClick
    : current.action?.kind === 'addSchedule' ? onAddScheduleClick
    : undefined;

  return (
    <header className="pebble-header" style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="font-display" style={{ fontSize: '1.4rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.title}</h1>
          <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          {current.action && handleActionClick && (
            <div ref={actionsRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {/* Drops BELOW the header rather than expanding sideways: a
                  horizontal expansion pushes the page title back under an
                  ellipsis, which is the problem this exists to solve.
                  Absolutely positioned so it never occupies layout width.

                  grid-template-rows 0fr -> 1fr is the same technique
                  .collapsible-rows uses, so both animations behave alike. */}
              {current.secondaryAction && (
                <div
                  style={{
                    // 'fixed', not 'absolute': overflow on an ancestor clips
                    // absolutely positioned descendants regardless of z-index,
                    // and html/body carry overflow: hidden from the mobile
                    // scroll lock. Same reasoning as SearchableSelect's portal.
                    position: 'fixed', top: pos?.top ?? 0, right: pos?.right ?? 0, zIndex: 30,
                    display: 'grid',
                    gridTemplateRows: actionsOpen ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: actionsOpen ? 'auto' : 'none',
                  }}
                >
                  <div style={{ overflow: 'hidden', minHeight: 0 }}>
                    <div
                      className="card"
                      style={{
                        padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem',
                        minWidth: 190, opacity: actionsOpen ? 1 : 0, transition: 'opacity 0.2s ease',
                      }}
                    >
                      <button
                        onClick={() => { setActionsOpen(false); handleActionClick(); }}
                        tabIndex={actionsOpen ? 0 : -1}
                        className="btn-primary"
                        style={{ whiteSpace: 'nowrap', justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
                      >
                        <Plus size={16} /> {current.action.label}
                      </button>
                      <button
                        onClick={() => { setActionsOpen(false); onTransferClick(); }}
                        tabIndex={actionsOpen ? 0 : -1}
                        className="pill"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.6rem 0.85rem', whiteSpace: 'nowrap', justifyContent: 'flex-start' }}
                      >
                        <ArrowRightLeft size={15} /> {current.secondaryAction.label}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* When there is no second action the toggle is pointless, so the
                  primary button renders directly instead. */}
              {current.secondaryAction ? (
                <button
                  onClick={() => setActionsOpen((v) => !v)}
                  className={actionsOpen ? 'icon-btn' : 'btn-primary'}
                  aria-expanded={actionsOpen}
                  aria-label={actionsOpen ? d.common.close : current.action.label}
                  style={{ width: 38, height: 38, borderRadius: '50%', padding: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {actionsOpen ? <X size={16} /> : <Plus size={18} />}
                </button>
              ) : (
                <button onClick={handleActionClick} className="btn-primary">
                  <Plus size={16} /> <span className="add-btn-label">{current.action.label}</span>
                </button>
              )}
            </div>
          )}
                  </div>
      </div>
    </header>
  );
}
