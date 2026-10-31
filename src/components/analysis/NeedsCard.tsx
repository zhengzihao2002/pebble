'use client';

import Link from '@/components/loading/PendingLink';
import type { ReactNode } from 'react';
import { CalendarRange, Hourglass, PiggyBank, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { requestShell } from '@/components/layout/shellEvents';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { CardHead } from './parts';

/**
 * Why a card has nothing to show yet. The cards keep their place on the page
 * (a brand-new account sees the same cards as a full one, owner request), so
 * each says what it is missing and what fixes it, instead of disappearing.
 *
 *  noData      no transactions at all
 *  noMonth     transactions, but no finished calendar month yet
 *  noIncome    complete months, but no income in the period
 *  noSpending  complete months, but no spending in the period
 *  noBudget    no yearly budget set (Budget pace)
 */
export type Need = 'noData' | 'noMonth' | 'noIncome' | 'noSpending' | 'noBudget';

/**
 * The cards that wait on history, each with its own title and sentence
 * (<card>NeedTitle / <card>NeedBody in analysis.ts): a dozen identical "needs
 * a full month" cards read as one error repeated, so every card says what IT
 * will show and what it counts. Budget pace has its own single message.
 */
export type NeedCard =
  | 'glance' | 'incomeFigures' | 'deductions' | 'spendingFigures' | 'monthly' | 'topCats'
  | 'flow' | 'cushion' | 'heat' | 'projection' | 'yoy';

const NEED_ICON: Record<Need, LucideIcon> = {
  noData: CalendarRange, noMonth: Hourglass, noIncome: Wallet, noSpending: Receipt, noBudget: PiggyBank,
};

/**
 * A muted stand-in for one card: the card's own title and icon (so it is
 * recognisably the same card), a one-line reason and a one-line fix. The fix
 * is a quiet link, not a primary button - a dozen of them on one page would
 * shout. Nothing here is a number, so privacy mode has nothing to hide.
 */
export function NeedsCard({ need, card, title, icon, className = '', children }: {
  need: Need;
  /** Which card this stands in for: its own wording replaces the generic reason. */
  card?: NeedCard;
  title: ReactNode;
  icon: ReactNode;
  className?: string;
  /** Replaces the default action (a card with its own fix, e.g. add a schedule). */
  children?: ReactNode;
}) {
  const { d } = useTranslation();
  const x = d.ux.analysis;
  // The card's own title only for the history needs its title names; "no income" / "no spending" keep the exact reason.
  const history = need === 'noData' || need === 'noMonth';
  const reason = card && history ? x[`${card}NeedTitle` as const] : x[`${need}Reason` as const];
  const todo = x[`${need}Todo` as const];
  // With a card's own sentence the shared line becomes the unlock hint under it.
  const body = card ? <>{x[`${card}NeedBody` as const]}<span className="pb-ana-needs-tail">{todo}</span></> : todo;
  const action = children ?? (need === 'noBudget' ? (
    <Link href="/budgets" className="link-btn pb-ana-needs-link">{x.goBudgets}</Link>
  ) : need === 'noMonth' ? null : (
    <button type="button" className="link-btn pb-ana-needs-link" onClick={() => requestShell('addTransaction')}>{x.addTransaction}</button>
  ));
  return (
    <section className={`card pb-ana-card pb-ana-needs ${className}`}>
      <CardHead icon={icon} title={title} />
      <EmptyState compact icon={NEED_ICON[need]} title={reason} body={body} action={action} />
    </section>
  );
}
