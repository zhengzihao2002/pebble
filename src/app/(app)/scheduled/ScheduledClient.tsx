'use client';

import { useState } from 'react';
import { CalendarClock, Pause, Pencil, Play } from 'lucide-react';
import { setRecurringRuleStatusAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { RecurringRuleModal } from '@/components/modals/RecurringRuleModal';
import { formatCurrency, formatDate } from '@/lib/format';
import { isExhausted } from '@/lib/recurring/occurrences';
import { CatchUpNotice } from '@/components/shared/CatchUpNotice';
import type { RecurringRule, UpcomingOccurrence } from '@/types';

interface ScheduledClientProps {
  rules: RecurringRule[];
  upcoming: UpcomingOccurrence[];
  previewDays: number;
  catchUp: { expensesCreated: number; incomeCreated: number; truncated: boolean; failed?: boolean };
}

const FREQUENCY_LABEL: Record<RecurringRule['frequency'], string> = {
  once: 'One-off',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

function describeSchedule(rule: RecurringRule): string {
  const base = FREQUENCY_LABEL[rule.frequency];
  if (rule.frequency === 'once') return `${base} on ${formatDate(rule.startDate)}`;
  if (rule.endMode === 'after' && rule.endCount) return `${base}, ${rule.endCount} payments from ${formatDate(rule.startDate)}`;
  if (rule.endMode === 'on' && rule.endDate) return `${base} until ${formatDate(rule.endDate)}`;
  return `${base} from ${formatDate(rule.startDate)}`;
}

export function ScheduledClient({ rules, upcoming, previewDays, catchUp }: ScheduledClientProps) {
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // The rule whose toggle failed, so Try again repeats that exact call rather
  // than whichever rule happens to be first.
  const [failedRule, setFailedRule] = useState<RecurringRule | null>(null);

  // No local state update and no router.refresh(): the action calls
  // revalidatePath(route, 'layout'), which re-renders this route's server
  // component and streams fresh props in.
  const toggleStatus = async (rule: RecurringRule) => {
    if (busyId) return;
    setBusyId(rule.id);
    setError(null);
    setFailedRule(null);
    const result = await callAction(() => setRecurringRuleStatusAction({
      id: rule.id,
      status: rule.status === 'active' ? 'paused' : 'active',
    }));
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      setErrorKind(result.kind);
      // Held so Try again repeats this rule's toggle. The status is re-read
      // from `rule` at retry time rather than captured, so a retry always
      // requests the flip from whatever the current state is.
      setFailedRule(rule);
    }
  };

  const cardStyle: React.CSSProperties = { padding: '1.5rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <CatchUpNotice {...catchUp} />

      <ActionError
        message={error} kind={errorKind}
        onRetry={failedRule ? () => void toggleStatus(failedRule) : undefined}
        busy={busyId !== null}
      />

      <div className="card" style={cardStyle}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Your schedules</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Payments and income Pebble creates for you. They appear when you open the app after their
          date, so nothing runs while Pebble is closed. Editing a schedule only affects what comes
          next — transactions it has already created are left exactly as they are, and deleting one
          you did not want is permanent. Pausing skips that period entirely rather than catching up
          on it later.
        </p>

        {rules.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0 }}>
            Nothing scheduled yet. Use <strong style={{ color: 'var(--ink)' }}>Add schedule</strong> above
            to set up a recurring payment like a car loan or your salary.
          </p>
        ) : (
          <div>
            {rules.map((rule) => {
              const paused = rule.status === 'paused';
              // A rule that has made every payment it ever will. Derived rather
              // than stored: an 'ended' status would mean a second ALTER TABLE
              // on live data for something that is a pure function of the end
              // condition and the high-water mark.
              const finished = isExhausted(rule, rule.materializedThrough);
              const isIncome = rule.kind === 'income';
              return (
                <div
                  key={rule.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.75rem 0', borderBottom: '1px solid var(--line)', opacity: paused || finished ? 0.55 : 1 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rule.description}
                      {finished
                        ? <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginLeft: 6, fontWeight: 400 }}>finished</span>
                        : paused && <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginLeft: 6, fontWeight: 400 }}>paused</span>}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--ink-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rule.category} · {describeSchedule(rule)}
                    </div>
                  </div>

                  <span
                    className="font-mono-tab"
                    style={{ fontSize: '0.88rem', fontWeight: 600, flexShrink: 0, color: isIncome ? 'var(--pine)' : 'var(--ink)' }}
                  >
                    {formatCurrency(rule.amount)}
                  </span>

                  <button
                    type="button" onClick={() => toggleStatus(rule)} disabled={busyId === rule.id || finished}
                    className="icon-btn" style={{ width: 30, height: 30, borderRadius: '0.5rem', flexShrink: 0 }}
                    aria-label={paused ? `Resume ${rule.description}` : `Pause ${rule.description}`}
                  >
                    {paused ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button
                    type="button" onClick={() => setEditing(rule)}
                    className="icon-btn" style={{ width: 30, height: 30, borderRadius: '0.5rem', flexShrink: 0 }}
                    aria-label={`Edit ${rule.description}`}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={cardStyle}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>
          Coming up
          <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--ink-soft)', marginLeft: 6 }}>
            next {previewDays} days
          </span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          These have not happened yet, so they are not in your balance. Paused schedules are not shown.
        </p>

        {upcoming.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CalendarClock size={15} />Nothing due in the next {previewDays} days.
          </p>
        ) : (
          <div>
            {upcoming.map((item) => (
              <div
                key={`${item.ruleId}-${item.date}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}
              >
                <span className="font-mono-tab" style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', flexShrink: 0, width: 74 }}>
                  {formatDate(item.date)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.87rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: 1 }}>{item.category} · {item.paymentMethod}</div>
                </div>
                <span
                  className="font-mono-tab"
                  style={{ fontSize: '0.86rem', fontWeight: 600, flexShrink: 0, color: item.kind === 'income' ? 'var(--pine)' : 'var(--ink)' }}
                >
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && <RecurringRuleModal rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
