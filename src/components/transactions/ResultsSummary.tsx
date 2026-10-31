'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';
import type { StatementEntry } from './StatementList';
import { SignedAmount } from './StatementList';
import type { TypeFilter } from './SearchToolbar';
import { SpendingMix } from './SpendingMix';

/**
 * In / out / net for a set of rows. Money in is every income record -
 * Standard Income AND Side Cash: this is the ledger, unlike the Dashboard and
 * Reports charts, which count Standard Income only. Adjustments (corrections
 * and transfers) are left out, as in the month's Deposits and Withdrawals.
 */
export function FlowFigures({ inn, out }: { inn: number; out: number }) {
  const { d } = useTranslation();
  const x = d.ux.transactions;
  return (
    <div className="pb-txn-sum-figs">
      <span>{renderTemplate(x.inAmount, { amount: <span className="font-mono-tab pb-txn-pos"><RollingAmount value={formatCurrency(inn)} /></span> })}</span>
      <span>{renderTemplate(x.outAmount, { amount: <span className="font-mono-tab pb-txn-neg"><RollingAmount value={formatCurrency(out)} /></span> })}</span>
      <span>{renderTemplate(x.netAmount, { amount: <SignedAmount value={inn - out} /> })}</span>
    </div>
  );
}

/**
 * What the matches add up to.
 *
 * Type All: in, out and net. Type Expense or Income: in, out and net used to
 * show here too, but one side was always zero (an Expense view has no money
 * in), so each now shows its one meaningful figure and the average record -
 * and Income splits it by income category when it has both. Expense
 * keeps the bar of the matched spending by category (interactive, see
 * SpendingMix), as does All when it holds spending.
 */
export function ResultsSummary({ results, categoryMeta, type }: { results: StatementEntry[]; categoryMeta: CategoryMeta; type: TypeFilter }) {
  const { d } = useTranslation();
  const x = d.ux.transactions;
  const flows = results.filter((e) => e.record.type !== 'adjustment');
  const out = flows.reduce((s, e) => (e.record.amount < 0 ? s - e.record.amount : s), 0);
  const inn = flows.reduce((s, e) => (e.record.amount > 0 ? s + e.record.amount : s), 0);

  const byCat = new Map<string, [number, number]>();
  const byIncome = new Map<string, number>();
  for (const e of flows) {
    const r = e.record;
    if (r.type === 'expense') {
      const [v, n] = byCat.get(r.category) ?? [0, 0];
      byCat.set(r.category, [v - r.amount, n + 1]);
    } else if (r.type === 'income') {
      byIncome.set(r.category, (byIncome.get(r.category) ?? 0) + r.amount);
    }
  }
  const mix = [...byCat.entries()].map(([c, [v, n]]) => [c, v, n] as [string, number, number]).sort((a, b) => b[1] - a[1]);
  // The results line above already counts the matches, so the figure
  // beside the total is the average record instead.
  const count = flows.length;
  const avg = count > 0 ? (type === 'expense' ? out : inn) / count : 0;

  return (
    <div className="pb-txn-sum">
      {type === 'all' ? (
        <FlowFigures inn={inn} out={out} />
      ) : (
        <div className="pb-txn-sum-figs">
          <span>
            {type === 'expense'
              ? renderTemplate(x.totalOut, { amount: <span className="font-mono-tab pb-txn-neg"><RollingAmount value={formatCurrency(out)} /></span> })
              : renderTemplate(x.totalIn, { amount: <span className="font-mono-tab pb-txn-pos"><RollingAmount value={formatCurrency(inn)} /></span> })}
          </span>
          {count > 1 && <span>{renderTemplate(x.avgAmount, { amount: <span className="font-mono-tab"><RollingAmount value={formatCurrency(avg)} /></span> })}</span>}
        </div>
      )}
      {/* The income split as its own soft line, not more figures in the
          row (on a phone it would put one figure alone on a second line).
          Income categories are stored literals; only labels are translated. */}
      {type === 'income' && byIncome.size > 1 && (
        <p className="pb-txn-sum-split">
          {[...byIncome.entries()].sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
            <span key={cat}>
              {categoryLabel(d, cat)}{' '}
              <span className="font-mono-tab"><RollingAmount value={formatCurrency(v)} /></span>
            </span>
          ))}
        </p>
      )}
      {type !== 'income' && out > 0 && mix.length > 0 && (
        <SpendingMix mix={mix} total={out} categoryMeta={categoryMeta} />
      )}
    </div>
  );
}
