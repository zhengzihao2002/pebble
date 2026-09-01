'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus, Bell, ArrowRightLeft } from 'lucide-react';
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
          {/* Secondary first: it reads left-to-right as the lesser action
              before the primary one, and keeps the primary button adjacent to
              the icon buttons it is grouped with. */}
          {current.secondaryAction && (
            <button onClick={onTransferClick} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 0.85rem', whiteSpace: 'nowrap' }}>
              <ArrowRightLeft size={15} /> <span className="add-btn-label">{current.secondaryAction.label}</span>
            </button>
          )}
          {current.action && handleActionClick && (
            <button onClick={handleActionClick} className="btn-primary">
              <Plus size={16} /> <span className="add-btn-label">{current.action.label}</span>
            </button>
          )}
          {/* aria-label added: this is an icon-only button with no accessible
              name at all. See the note in the step that introduced it - remove
              the attribute if you would rather keep this phase to translation
              alone. */}
          <button className="icon-btn" aria-label={d.header.notifications} style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }}>
            <Bell size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
