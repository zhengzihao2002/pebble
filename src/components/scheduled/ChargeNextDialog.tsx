'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, CalendarCheck } from 'lucide-react';
import { chargeNextRecurringAction, type ChargeNextRecurringResult } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { CloseSoon } from '@/components/shared/CloseSoon';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { ChargeNextPlan } from '@/lib/recurring/chargeNext';
import type { RecurringRule } from '@/types';

type Charged = Extract<ChargeNextRecurringResult, { ok: true }>;

interface ChargeNextDialogProps {
  rule: RecurringRule;
  /** The plan the person is being shown. Frozen when the dialog opens: the
      occurrence confirmed here is the one sent as expectedOccurrence. */
  plan: ChargeNextPlan;
  onClose: () => void;
  /** Called once the server confirms, before the dialog closes. */
  onCharged: (rule: RecurringRule, result: Charged) => void;
}

/**
 * "Charge next payment now" confirmation. Says exactly what will happen -
 * which payment, the date it is recorded on, and what the schedule becomes -
 * before anything is written (the same facts planChargeNext hands the server,
 * so the sentence cannot promise something else than the action does).
 *
 * The call is guarded server-side by expectedOccurrence: if the schedule moved
 * on since this dialog opened (another tab, an edit) the server refuses
 * instead of charging a different payment, and that refusal is shown here.
 * Because the server's write is a compare-and-set, Try again after a
 * connection failure cannot charge twice either.
 *
 * Closes from a settled render (CloseSoon) once the write has cleared busy,
 * never from the handler - see CloseSoon.
 */
export function ChargeNextDialog({ rule, plan, onClose, onCharged }: ChargeNextDialogProps) {
  const { d, t, locale } = useTranslation();
  const router = useRouter();
  const x = rule.kind === 'income' ? { ...d.ux.scheduled, ...d.ux.scheduled.incomeCharge } : d.ux.scheduled;
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);

  const isIncome = rule.kind === 'income';
  const KindIcon = isIncome ? ArrowUpRight : ArrowDownRight;
  const title = descriptionTitle(rule.description);
  const occurrence = formatDate(plan.occurrenceDate, locale);

  const confirm = async () => {
    if (saving || done) return;
    setSaving(true);
    setError(null);
    const result = await callAction(
      () => chargeNextRecurringAction({ id: rule.id, expectedOccurrence: plan.occurrenceDate }),
      x.chargeFailed,
    );
    setSaving(false);
    if (!result.ok) {
      // The server's "schedule changed" refusal carries no code (the
      // dictionaries are not this area's to extend), so it is worded here,
      // in the person's language, rather than shown as English.
      const code = (result as { code?: string }).code;
      const stale = !code && result.kind === 'validation';
      setError(stale ? x.chargeStale : translateActionError(d, locale, result));
      setErrorKind(result.kind);
      // A refused (stale) charge writes nothing, so nothing revalidated: the
      // cards behind this dialog still show the old Next line. Fetch the
      // current schedules so they are right when the dialog is closed.
      if (stale) router.refresh();
      return;
    }
    onCharged(rule, result);
    setDone(true);
  };

  return (
    <ModalFrame onClose={onClose} busy={saving} labelledBy="charge-next-title" maxWidth={440}>
      {(close) => (
        <>
          {done && !saving && <CloseSoon close={close} />}
          {saving && <LoadingOverlay label={x.chargeOverlay} />}

          <div className="pb-modal-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="charge-next-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{x.chargeTitle}</h2>
              <ModalCloseButton onClick={close} disabled={saving} />
            </div>
          </div>

          <div className="pb-modal-body themed-scroll">
            <div className="pb-sched-charge-rule">
              <span className={`pb-sched-chip ${isIncome ? 'is-in' : 'is-out'}`} aria-hidden="true">
                <KindIcon size={18} strokeWidth={2.25} />
              </span>
              <div className="pb-sched-charge-who">
                {/* rule.description is USER DATA - rendered as stored. */}
                <span className="pb-sched-row-title">{title}</span>
                <span className="font-mono-tab pb-sched-charge-amt" style={{ color: isIncome ? 'var(--pine)' : 'var(--ink)' }}>
                  {formatCurrency(rule.amount)}
                </span>
              </div>
            </div>

            <p className="pb-sched-charge-intro">{x.chargeIntro}</p>

            <div className="pb-sched-charge-facts">
              <p className="pb-sched-charge-what pb-tnum">
                <CalendarCheck size={15} aria-hidden="true" />{t(x.chargeWhat, { date: occurrence })}
              </p>
              <p className="pb-tnum">
                {plan.early ? x.chargeRecordedToday : t(x.chargeRecordedOn, { date: formatDate(plan.transactionDate, locale) })}
              </p>
              <p className="pb-tnum">
                {plan.nextAfter && !plan.finishesRule
                  ? t(x.chargeThenNext, { date: formatDate(plan.nextAfter, locale) })
                  : x.chargeLast}
              </p>
            </div>
          </div>

          <div className="pb-modal-foot">
            <ActionError message={error} kind={errorKind} onRetry={() => void confirm()} busy={saving} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={close} disabled={saving} className="pill pb-sched-charge-btn">{x.chargeCancel}</button>
              <button type="button" onClick={() => void confirm()} disabled={saving || done} className="btn-primary pb-sched-charge-btn" style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? x.chargeCharging : x.chargeConfirm}
              </button>
            </div>
          </div>
        </>
      )}
    </ModalFrame>
  );
}
