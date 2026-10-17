'use client';

import { Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The CSV import's three steps, in the dialog head: done steps carry a pine
 * check, the current one is filled pine, and a hairline underneath fills to
 * the step reached. Display only - Back and Next in the foot move between
 * steps, exactly as before.
 */
export function ImportStepper({ step, complete = false }: { step: 0 | 1 | 2; complete?: boolean }) {
  const { d, t } = useTranslation();
  const x = d.ux.transactionDialogs;
  const labels = [x.stepFile, x.stepColumns, x.stepReview];
  const reached = complete ? labels.length : step + 1;
  return (
    <div className="pb-tdlg-steps">
      <ol aria-label={x.stepsLabel}>
        {labels.map((label, i) => {
          const state = complete || i < step ? 'done' : i === step ? 'current' : 'todo';
          return (
            <li key={label} className={`pb-tdlg-step pb-tdlg-step-${state}`} aria-current={!complete && i === step ? 'step' : undefined}>
              <span className="pb-tdlg-step-dot pb-tnum" aria-hidden="true">
                {state === 'done' ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="pb-tdlg-step-label">{label}</span>
              {state === 'current' && <span className="pb-tdlg-sr">{` (${t(x.stepOf, { n: i + 1, total: labels.length })})`}</span>}
            </li>
          );
        })}
      </ol>
      <span className="pb-tdlg-steps-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${reached / labels.length})` }} />
      </span>
    </div>
  );
}
