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
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { categoryLabel, paymentMethodLabel } from '@/lib/i18n/enumLabels';
import type { Dictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/locale';
import type { RecurringRule, UpcomingOccurrence } from '@/types';

interface ScheduledClientProps {
  rules: RecurringRule[];
  upcoming: UpcomingOccurrence[];
  previewDays: number;
  catchUp: { expensesCreated: number; incomeCreated: number; truncated: boolean; failed?: boolean };
}

/**
 * Builds the inline schedule description ("Monthly from Aug 21" etc.).
 *
 * Takes d/t/locale as parameters rather than calling useTranslation() itself:
 * it is a plain function used inside a .map(), not a component, and passing
 * the already-resolved dictionary avoids resolving it once per rule.
 *
 * rule.frequency indexes d.scheduled.frequencyShort directly - both are typed
 * against the same RecurringFrequency values, so a mismatched key is a
 * compile error.
 */
function describeSchedule(rule: RecurringRule, d: Dictionary, t: typeof import('@/lib/i18n').t, locale: Locale): string {
  const freq = d.scheduled.frequencyShort[rule.frequency];
  if (rule.frequency === 'once') return t(d.scheduled.onceOn, { freq, date: formatDate(rule.startDate, locale) });
  if (rule.endMode === 'after' && rule.endCount) return t(d.scheduled.afterCount, { freq, count: rule.endCount, date: formatDate(rule.startDate, locale) });
  if (rule.endMode === 'on' && rule.endDate) return t(d.scheduled.until, { freq, date: formatDate(rule.endDate, locale) });
  return t(d.scheduled.from, { freq, date: formatDate(rule.startDate, locale) });
}

export function ScheduledClient({ rules, upcoming, previewDays, catchUp }: ScheduledClientProps) {
  const { d, t, locale } = useTranslation();
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
      setError(translateActionError(d, locale, result));
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
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.scheduled.title}</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          {d.scheduled.blurb}
        </p>

        {rules.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0 }}>
            {/* {action} renders the Header button's own label - one source of
                truth, so a rename there cannot leave this sentence stale.
                Split on the placeholder rather than using t() directly so the
                button name keeps its <strong> styling. */}
            {(() => {
              // Split on the placeholder so the button name keeps its <strong>
              // styling, matching the pattern used for every other multi-part
              // sentence with an embedded emphasis.
              const parts = d.scheduled.emptyHint.split('{action}');
              return (
                <>
                  {parts[0]}
                  <strong style={{ color: 'var(--ink)' }}>{d.header.addSchedule}</strong>
                  {parts[1]}
                </>
              );
            })()}
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
                      {/* rule.description is USER DATA - rendered as stored. */}
                      {rule.description}
                      {finished
                        ? <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginLeft: 6, fontWeight: 400 }}>{d.scheduled.finished}</span>
                        : paused && <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginLeft: 6, fontWeight: 400 }}>{d.scheduled.paused}</span>}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--ink-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {/* rule.category is either a real category name (user
                          data) or one of the two income literals - one call
                          handles both, translating only the latter. */}
                      {categoryLabel(d, rule.category)} · {describeSchedule(rule, d, t, locale)}
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
                    aria-label={t(paused ? d.scheduled.resumeAria : d.scheduled.pauseAria, { description: rule.description })}
                  >
                    {paused ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button
                    type="button" onClick={() => setEditing(rule)}
                    className="icon-btn" style={{ width: 30, height: 30, borderRadius: '0.5rem', flexShrink: 0 }}
                    aria-label={t(d.scheduled.editAria, { description: rule.description })}
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
          {d.scheduled.comingUp}
          <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--ink-soft)', marginLeft: 6 }}>
            {t(d.scheduled.nextDays, { days: previewDays })}
          </span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          {d.scheduled.upcomingHint}
        </p>

        {upcoming.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CalendarClock size={15} />{t(d.scheduled.nothingDue, { days: previewDays })}
          </p>
        ) : (
          <div>
            {upcoming.map((item) => (
              <div
                key={`${item.ruleId}-${item.date}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}
              >
                <span className="font-mono-tab" style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', flexShrink: 0, width: 74 }}>
                  {formatDate(item.date, locale)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.87rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: 1 }}>
                    {categoryLabel(d, item.category)} · {paymentMethodLabel(d, item.paymentMethod)}
                  </div>
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
