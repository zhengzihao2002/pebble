import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface BudgetRowProps {
  name: string;
  icon: LucideIcon;
  color: string;
  budget: number;
  spent: number;
  pct: number;
  /** Share of the year elapsed (0-1): draws the year-pace marker. Omit for no marker. */
  yearFraction?: number;
  /** The status line on the right ("On pace", "$120 over pace", "No budget"). */
  status?: React.ReactNode;
  /** Tone of the status line: a theme token. */
  statusColor?: string;
  /** Shown in the marker's hover/focus tip, e.g. "Expected by today: $X" (money in pb-money). */
  markerTip?: React.ReactNode;
  /** Accessible name of the marker; never an amount. */
  markerLabel?: string;
  /** Second line under the name, used for a category without a budget. */
  note?: React.ReactNode;
  /** Extra class on the row (the Dashboard hides rows that do not fit). */
  className?: string;
}

/**
 * One budget line for the Dashboard's Needs attention card (its only
 * consumer; the Budgets page keeps its own row in BudgetRows.tsx).
 *
 * Bar colours are unchanged: wine past 100%, gold past 85%, pine otherwise,
 * width capped at 100% with a smooth transition. The year-pace marker is the
 * Budgets page's idea: where spending would be today on an even pace. Its tip
 * is a real element (not a data attribute or title) so the amount inside it
 * can blur in privacy mode.
 *
 * A category with spending but no budget has nothing to fill, so it shows a
 * quiet note instead of a "$X / $0.00" bar that read like a bug.
 */
export function BudgetRow({ name, icon: Icon, color, budget, spent, pct, yearFraction, status, statusColor, markerTip, markerLabel, note, className }: BudgetRowProps) {
  const tipId = useId();
  const over = pct > 100;
  const barColor = over ? 'var(--wine)' : pct > 85 ? 'var(--gold)' : 'var(--pine)';
  return (
    <div className={className ? `pb-dash-budget ${className}` : 'pb-dash-budget'}>
      <div className="pb-dash-budget-top">
        <span className="pb-dash-budget-name">
          <span className="pb-dash-budget-icon" aria-hidden="true" style={{ backgroundColor: `${color}1f` }}>
            <Icon size={15} style={{ color }} />
          </span>
          <span className="pb-dash-budget-label">{name}</span>
        </span>
        {status && <span className="pb-dash-budget-status" style={{ color: statusColor }}>{status}</span>}
      </div>
      {budget > 0 ? (
        <>
          <div className="pb-dash-budget-bar">
            <div className="pb-dash-budget-track">
              <div className="pb-dash-budget-fill" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
            </div>
            {yearFraction !== undefined && (
              // Late in the year the marker nears the right edge, so its tip
              // anchors to the marker's end instead of centring (and to its
              // start early on): it never runs past the card on a phone. The
              // tip is also the marker's description: inside role=img it is
              // presentational, so aria-describedby is what lets assistive
              // tech read the expected amount.
              <span
                className={`pb-dash-budget-marker${yearFraction > 0.6 ? ' is-end' : yearFraction < 0.4 ? ' is-start' : ''}`}
                tabIndex={0} role="img" aria-label={markerLabel} aria-describedby={markerTip ? tipId : undefined}
                style={{ left: `${Math.min(1, Math.max(0, yearFraction)) * 100}%` }}
              >
                {markerTip && <span id={tipId} className="pb-dash-budget-tip">{markerTip}</span>}
              </span>
            )}
          </div>
          <span className="font-mono-tab pb-dash-budget-figs" style={{ color: over ? 'var(--wine)' : undefined }}>
            {formatCurrency(spent)} <span style={{ opacity: 0.6 }}>/ {formatCurrency(budget)}</span>
          </span>
        </>
      ) : (
        note && <span className="pb-dash-budget-note">{note}</span>
      )}
    </div>
  );
}
