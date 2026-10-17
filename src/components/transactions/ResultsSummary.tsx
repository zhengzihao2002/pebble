'use client';

import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';
import type { StatementEntry } from './StatementList';
import { SignedAmount } from './StatementList';

/**
 * What the matches add up to: out, in and net (adjustments left out, as in
 * the month's totals), and a thin bar of the matched spending by category
 * with the top three named. Category colours are user data and only mark
 * identity; each legend entry also carries its name and share.
 */
export function ResultsSummary({ results, categoryMeta }: { results: StatementEntry[]; categoryMeta: CategoryMeta }) {
  const { d, t } = useTranslation();
  const x = d.ux.transactions;
  const flows = results.filter((e) => e.record.type !== 'adjustment');
  const out = flows.reduce((s, e) => (e.record.amount < 0 ? s - e.record.amount : s), 0);
  const inn = flows.reduce((s, e) => (e.record.amount > 0 ? s + e.record.amount : s), 0);

  const byCat = new Map<string, number>();
  for (const e of flows) {
    if (e.record.type !== 'expense') continue;
    byCat.set(e.record.category, (byCat.get(e.record.category) ?? 0) - e.record.amount);
  }
  const mix = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const top = mix.slice(0, 3);

  return (
    <div className="pb-txn-sum">
      <div className="pb-txn-sum-figs">
        <span>{renderTemplate(x.outAmount, { amount: <span className="font-mono-tab pb-txn-neg">{formatCurrency(out)}</span> })}</span>
        <span>{renderTemplate(x.inAmount, { amount: <span className="font-mono-tab pb-txn-pos">{formatCurrency(inn)}</span> })}</span>
        <span>{renderTemplate(x.netAmount, { amount: <SignedAmount value={inn - out} /> })}</span>
      </div>
      {out > 0 && mix.length > 0 && (
        <div className="pb-txn-mix">
          <p className="filter-label" style={{ margin: 0 }}>{x.spendingMix}</p>
          <div className="pb-chart-fill">
            <div className="pb-bar-track pb-txn-mix-track" aria-hidden="true">
              {mix.map(([cat, v]) => (
                <span key={cat} className="pb-bar-seg" style={{ flexGrow: v, backgroundColor: categoryMeta[cat]?.color ?? 'var(--ink-faint)' }} />
              ))}
            </div>
          </div>
          <ul className="pb-txn-mix-legend">
            {top.map(([cat, v]) => (
              <li key={cat}>
                <span className="pb-txn-mix-dot" style={{ backgroundColor: categoryMeta[cat]?.color ?? 'var(--ink-faint)' }} aria-hidden="true" />
                <span className="pb-txn-mix-name">{categoryLabel(d, cat)}</span>
                <span className="pb-tnum pb-txn-mix-pct">{Math.round((v / out) * 100)}%</span>
              </li>
            ))}
            {mix.length > 3 && <li className="pb-txn-mix-more">{t(x.moreCategories, { count: mix.length - 3 })}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
