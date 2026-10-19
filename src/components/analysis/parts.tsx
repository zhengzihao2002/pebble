'use client';

import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { PeriodDot } from '@/components/shared/PeriodLink';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Dictionary } from '@/lib/i18n';
import type { t as translate } from '@/lib/i18n';

/** The id of the sticky period bar: follower chips scroll to and pulse it. */
export const PERIOD_BAR_ID = 'pb-ana-period';

export const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

/** Whole dollars, for headline figures that are estimates (the exact cents
 *  stay in the section tiles). Same en-US shape and U+2212 minus as
 *  formatCurrency. */
export const wholeDollars = (n: number) => {
  const s = `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
  return Math.round(n) < 0 ? `−${s}` : s;
};

// Was a local one-off ('X.X month(s)'). Now the fourth place in this project
// with this exact shape (Reports, the budget modal, CatchUpNotice), so it
// reuses the shared analysis.monthsOne/Other pair instead of adding a fifth.
export const monthsLabel = (n: number, d: Dictionary, t: typeof translate) =>
  t(n.toFixed(1) === '1.0' ? d.analysis.monthsOne : d.analysis.monthsOther, { n: n.toFixed(1) });

// 'N transaction(s)' - identical wording to d.reports.transactionsOne/Other,
// reused rather than duplicated.
export const countNote = (n: number, d: Dictionary, t: typeof translate) =>
  t(n === 1 ? d.reports.transactionsOne : d.reports.transactionsOther, { count: n });

/**
 * A metric tile: label with its explanation, the figure, a quiet note. Keeps
 * the shared .stat-tab class (and so the in-card flattening), with an area
 * modifier that stops the figure wrapping mid-number: it scales with the
 * tile instead (each tile is a size container), as the Dashboard's do.
 *
 * `money` is false for figures that are not amounts (a percentage, a band
 * word, a month count): those use pb-tnum and stay readable in privacy mode.
 */
export function Tile({ label, value, note, tooltipLabel, children, money = true, extra, className }: {
  label: string; value: string; note?: ReactNode; tooltipLabel?: string; children?: ReactNode;
  money?: boolean; extra?: ReactNode; className?: string;
}) {
  return (
    <div className={`stat-tab pb-ana-tile${className ? ` ${className}` : ''}`}>
      <p className="pb-ana-tile-label">
        <span>{label}</span>
        {tooltipLabel && <InfoTooltip label={tooltipLabel}>{children}</InfoTooltip>}
      </p>
      <p className={`pb-ana-tile-value ${money ? 'font-mono-tab' : 'pb-tnum'}`}>{value}</p>
      {note && <p className="pb-ana-tile-note">{note}</p>}
      {extra}
    </div>
  );
}

/** Card heading with an explanation, a quiet scope line and a scope badge. */
export function CardHead({ title, tooltipLabel, tooltip, scope, badge, actions, id, icon }: {
  title: ReactNode; tooltipLabel?: string; tooltip?: ReactNode; scope?: ReactNode;
  badge?: ReactNode; actions?: ReactNode; id?: string; icon?: ReactNode;
}) {
  return (
    <div className="pb-ana-head">
      <div className="pb-ana-head-main">
        {icon && <span className="pb-ana-head-icon" aria-hidden="true">{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <h3 id={id} className="pb-ana-head-title">
            <span>{title}</span>
            {tooltipLabel && <InfoTooltip label={tooltipLabel}>{tooltip}</InfoTooltip>}
          </h3>
          {(scope || badge) && (
            <div className="pb-ana-head-sub">
              {badge}
              {scope && <span>{scope}</span>}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="pb-ana-head-actions">{actions}</div>}
    </div>
  );
}

/** A fixed-scope card's quiet badge: what it covers, when that is NOT the period. */
export function ScopeBadge({ children }: { children: ReactNode }) {
  return <span className="pb-ana-badge">{children}</span>;
}

/** One pending clean-up per element, so repeat taps never cut a ring short. */
const pulseTimers = new WeakMap<HTMLElement, number>();

/**
 * A card that follows the period wears this chip (the same pine dot and
 * chip as the Dashboard's and Accounts' followers). Tapping it pulses the
 * sticky period bar - already on screen - so the link is learned by doing.
 *
 * Its own small component rather than a new PeriodLink target: PeriodLink
 * scrolls its control to the centre of the screen, which a sticky bar
 * cannot do; here the bar is always in view and only needs the pulse.
 */
export function PeriodChip({ range }: { range: string }) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const label = t(x.followsPeriod, { range });
  const pulse = () => {
    const el = document.getElementById(PERIOD_BAR_ID);
    if (!el) return;
    globalThis.clearTimeout(pulseTimers.get(el));
    el.classList.remove('pb-period-pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('pb-period-pulse');
    pulseTimers.set(el, globalThis.setTimeout(() => el.classList.remove('pb-period-pulse'), 2000) as unknown as number);
  };
  return (
    <button type="button" className="pb-period-chip pb-ana-chip" onClick={pulse} aria-label={t(x.periodLinkAria, { label })}>
      <PeriodDot />
      <span className="pb-tnum">{range}</span>
      <Link2 size={12} aria-hidden="true" />
    </button>
  );
}
