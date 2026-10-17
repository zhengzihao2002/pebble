'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

interface BalanceBridgeProps {
  opening: number;
  deposits: number;
  withdrawals: number;
  /** Signed. */
  adjustments: number;
  closing: number;
}

/**
 * How the month's balance moved, as a picture of the identity the figures
 * below already obey: opening + deposits - withdrawals + adjustments = closing.
 *
 * Two forms, chosen by container query, never by JS (both are rendered; CSS
 * shows one):
 *  - Wide (content >= 900px): a waterfall on the same five tracks as the
 *    five figures under it, so each bar stands over its own number. Opening
 *    and Closing rise from the baseline; Deposits float up from the opening,
 *    Withdrawals down from there, Adjustments (gold, hatched; a hairline when
 *    zero) close the gap. Dashed connectors join each step. The scale always
 *    includes zero, so a negative total (card debt) drops below a hairline
 *    zero line. No axis numbers: the figures are right below.
 *  - Narrow (the side rail, a phone): one flow bar - money in against money
 *    out, with the adjustment as a sliver.
 *
 * Plain HTML boxes, not a chart library: five bars do not need one, and
 * percentage geometry lines up with the CSS grid of the figures exactly.
 * Inside .pb-chart-fade, so privacy mode blurs it and a tap reveals it.
 */
export function BalanceBridge({ opening, deposits, withdrawals, adjustments, closing }: BalanceBridgeProps) {
  const { d } = useTranslation();
  const afterIn = opening + deposits;
  const afterOut = afterIn - withdrawals;
  const points = [0, opening, afterIn, afterOut, closing];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  // Percent from the TOP of the plot, so a CSS top/bottom pair draws a bar.
  const y = (v: number) => ((hi - v) / span) * 100;

  const bars: { kind: string; from: number; to: number }[] = [
    { kind: 'open', from: 0, to: opening },
    { kind: 'in', from: opening, to: afterIn },
    { kind: 'out', from: afterIn, to: afterOut },
    { kind: 'adj', from: afterOut, to: closing },
    { kind: 'close', from: 0, to: closing },
  ];

  const flowTotal = deposits + withdrawals + Math.abs(adjustments);

  return (
    <div className="pb-txn-bridge pb-chart-fade" role="img" aria-label={d.ux.transactions.bridgeLabel}>
      <div className="pb-txn-fall" aria-hidden="true">
        {lo < 0 && <span className="pb-txn-fall-zero" style={{ top: `${y(0)}%` }} />}
        {bars.map((b, i) => {
          const top = y(Math.max(b.from, b.to));
          const bottom = 100 - y(Math.min(b.from, b.to));
          const flat = Math.abs(b.to - b.from) < 0.005;
          // The connector runs from this bar's end level into the next track.
          const end = i === 0 ? opening : i === 1 ? afterIn : i === 2 ? afterOut : closing;
          return (
            <span key={b.kind} className="pb-txn-fall-cell">
              <span
                className={`pb-txn-fall-bar pb-txn-fall-${b.kind}${flat ? ' pb-txn-fall-flat' : ''}`}
                style={flat ? { top: `${y(b.to)}%` } : { top: `${top}%`, bottom: `${bottom}%` }}
              />
              {i < bars.length - 1 && <span className="pb-txn-fall-link" style={{ top: `${y(end)}%` }} />}
            </span>
          );
        })}
      </div>
      <div className="pb-txn-flow" aria-hidden="true">
        {flowTotal > 0 ? (
          <>
            {deposits > 0 && <span className="pb-txn-flow-in" style={{ flexGrow: deposits }} />}
            {withdrawals > 0 && <span className="pb-txn-flow-out" style={{ flexGrow: withdrawals }} />}
            {Math.abs(adjustments) >= 0.005 && <span className="pb-txn-flow-adj" style={{ flexGrow: Math.abs(adjustments) }} />}
          </>
        ) : (
          <span className="pb-txn-flow-none" />
        )}
      </div>
    </div>
  );
}
