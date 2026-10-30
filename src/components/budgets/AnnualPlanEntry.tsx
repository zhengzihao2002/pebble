'use client';

import { CalendarClock, Check, FilePenLine } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { AnnualBudgetContext } from '@/lib/budgets/annualTypes';

export function AnnualPlanEntry({ context, today, hasBudgets }: { context: AnnualBudgetContext; today: string | null; hasBudgets: boolean }) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const next = context.nextPlan;
  const scheduled = next?.state === 'scheduled';
  const carry = !context.reviewed && hasBudgets;
  if (!next && carry) return null;
  const Icon = scheduled ? Check : next ? FilePenLine : CalendarClock;
  const year = String(context.year + 1);
  return (
    <div className="pb-annual-entry pb-annual-status">
      <span className="pb-sec-head-icon" aria-hidden="true"><Icon size={17} /></span>
      <div className="pb-annual-entry-copy">
        <p>{next ? t(scheduled ? x.scheduledStatus : x.draftStatus, { year }) : today && today.slice(5, 7) >= '10' ? x.remind : t(x.reviewedStatus, { year: String(context.year) })}</p>
        {!context.available && <small>{x.notReadyStatus}</small>}
      </div>
    </div>
  );
}
