'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight, Gauge } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { usePebbleStore } from '@/store/usePebbleStore';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { budgetAlerts, type BudgetAlert } from '@/lib/budgetAlerts';
import { CategoryTile } from './CategoryTile';

interface BudgetAlertsNoticeProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today: Date | null;
}

/** Pine under 80%, gold from 80%, wine from 100% - and the sentence says it in words too. */
const barColor = (pct: number) => (pct >= 100 ? 'var(--wine)' : pct >= 80 ? 'var(--gold)' : 'var(--pine)');

/**
 * Yearly-budget alerts for the top notice area: a category at 80% of its
 * annual budget, and the stronger note at 100%. Up to three, most severe
 * first. Renders nothing - no card, no gap - when there are none, and until
 * `today` resolves (so the server render and first client render agree).
 *
 * Dismissal reuses Insights' persisted list: the id carries the category,
 * year and level, so an alert dismissed at 80% returns when the category
 * crosses 100%, and every alert returns with the new year.
 */
export function BudgetAlertsNotice({ transactions, categoryMeta, today }: BudgetAlertsNoticeProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.dashboard;
  const dismissed = usePebbleStore((s) => s.insightsDismissed);
  const dismiss = usePebbleStore((s) => s.dismissInsight);
  const year = today ? today.getFullYear() : null;
  const alerts = useMemo(
    () => (year === null ? [] : budgetAlerts(transactions, categoryMeta, year, dismissed ?? [])),
    [transactions, categoryMeta, year, dismissed],
  );

  // A dismissed row takes its button with it: focus goes to the next row's
  // button (or the previous one) instead of falling back to the page.
  const root = useRef<HTMLElement>(null);
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    root.current?.querySelector<HTMLElement>(`[data-alert-id="${CSS.escape(id)}"] .pb-dash-quiet-btn`)?.focus();
  }, [alerts]);

  if (alerts.length === 0) return null;

  const onDismiss = (a: BudgetAlert) => {
    const i = alerts.findIndex((x) => x.id === a.id);
    focusAfter.current = (alerts[i + 1] ?? alerts[i - 1])?.id ?? null;
    dismiss(a.id);
  };

  const sentence = (a: BudgetAlert) => {
    // Category names are USER DATA: set apart as a title, not part of the sentence.
    const name = <strong className="pb-dash-name">{a.category}</strong>;
    const money = (n: number) => <span className="pb-money">{formatCurrency(Math.abs(n))}</span>;
    // `left` is already in whole cents, so float dust (0.1 + 0.2 against 0.3) never reads "over by $0.00".
    if (a.left < 0) return renderTemplate(ux.budgetAlertOver, { name, amount: money(-a.left) });
    if (a.level === 100) return renderTemplate(ux.budgetAlertFull, { name });
    return renderTemplate(ux.budgetAlertNear, { name, pct: <span className="pb-tnum">{a.pct}%</span>, amount: money(a.left) });
  };

  return (
    <section ref={root} className={`card pb-dash-notice pb-dash-alerts${alerts.some((a) => a.level === 100) ? ' is-over' : ''}`} aria-labelledby="pb-dash-alerts-title">
      <h3 id="pb-dash-alerts-title" className="pb-dash-notice-title"><Gauge size={15} aria-hidden="true" />{ux.budgetAlertsLabel}</h3>
      <ul className="pb-dash-notice-list">
        {alerts.map((a) => (
          <li key={a.id} data-alert-id={a.id} className="pb-dash-notice-row pb-dash-alert">
            <CategoryTile category={a.category} categoryMeta={categoryMeta} />
            <div className="pb-dash-notice-main">
              <p className="pb-dash-notice-text">{sentence(a)}</p>
              {/* The sentence carries the level in words; the bar is the glance. */}
              <div className="pb-dash-alert-meter" aria-hidden="true">
                <span className="pb-dash-alert-track"><span style={{ width: `${Math.min(100, a.pct)}%`, backgroundColor: barColor(a.pct) }} /></span>
                <span className="pb-dash-alert-pct pb-tnum">{a.pct}%</span>
              </div>
            </div>
            <div className="pb-dash-notice-actions">
              <Link href="/budgets" prefetch={false} className="link-btn" aria-label={t(ux.budgetAlertViewAria, { name: a.category })}>
                {ux.budgetAlertView} <ChevronRight size={14} aria-hidden="true" />
              </Link>
              <button type="button" className="pb-dash-quiet-btn" aria-label={t(ux.budgetAlertDismissAria, { name: a.category })} onClick={() => onDismiss(a)}>
                {ux.budgetAlertDismiss}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
