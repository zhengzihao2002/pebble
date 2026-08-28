'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';

interface GoalOverspendNoticeProps {
  totalBalance: number;
  /** Sum of every goal's set-aside amount. */
  allocated: number;
}

/**
 * Passive warning that goals now claim more money than actually exists.
 *
 * The add and edit transaction paths already ask before letting a save push
 * this negative. Recurring payments cannot: they are materialized on page load
 * with no Save button to intercept, so a blocking dialog is not merely
 * unwanted but impossible. This is the non-blocking equivalent.
 *
 * Deliberately keyed on the CONDITION, not on the event that caused it - it
 * shows whenever allocated exceeds the balance, whatever moved it. A notice
 * tied to "catch-up just ran" would vanish on the next reload while the
 * overspend was still true. It therefore also covers transaction deletion,
 * which the existing pre-save check never did.
 *
 * No dismiss control, for the same reason: dismissing a standing condition
 * only hides it.
 */
export function GoalOverspendNotice({ totalBalance, allocated }: GoalOverspendNoticeProps) {
  const { d } = useTranslation();
  if (allocated <= totalBalance) return null;

  const shortfall = allocated - totalBalance;

  return (
    <div
      className="card"
      style={{ padding: '1rem 1.1rem', borderLeft: '3px solid var(--wine)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
    >
      <AlertTriangle size={17} style={{ color: 'var(--wine)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.88rem', fontWeight: 600, margin: 0 }}>
          {d.goalOverspend.title}
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: '0.3rem 0 0' }}>
          {renderTemplate(d.goalOverspend.body, {
            allocated: formatCurrency(allocated),
            balance: formatCurrency(totalBalance),
            shortfall: <strong style={{ color: 'var(--wine)' }}>{formatCurrency(shortfall)}</strong>,
          })}
        </p>
        <Link href="/goals" className="link-btn" style={{ marginTop: '0.5rem', display: 'inline-flex' }}>
          {d.goalOverspend.reviewGoals} <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
