import {
  addDays,
  compareYmd,
  generateOccurrences,
  isExhausted,
  type RecurrenceSpec,
  type Ymd,
} from './occurrences';

/**
 * "Charge next payment now": the pure half of the early-charge action.
 *
 * Deliberately dependency-free (no db, no server-only) so the Scheduled
 * card, the confirm dialog and the server action all derive the SAME answer
 * from the same generator the catch-up and the Coming-up list use, and so it
 * can be tested without a database.
 *
 * THE SEMANTICS (what the confirm dialog tells the owner):
 *  - The occurrence charged is the rule's next one: the first occurrence
 *    strictly after the high-water mark (materializedThrough), or after
 *    yesterday for a rule that has never fired - the exact lower bound
 *    scheduled/page.tsx and nextDate() use, so it is the very row "Next ..."
 *    shows on the card.
 *  - It becomes a real transaction NOW. Dated on its own scheduled date when
 *    that is today or earlier; dated TODAY when it is still in the future
 *    (the person is paying early - a future-dated row would distort the
 *    current balance and Reports). The occurrence's own date is kept as its
 *    identity (occurrence_date), which is what keeps catch-up from charging
 *    it a second time.
 *  - The high-water mark moves to that occurrence, so the next payment
 *    becomes the one after it. Press again and it advances one more, one
 *    occurrence per press - also when the mark is already ahead of today.
 *  - If it was the last occurrence the rule is finished (derived, never
 *    stored - isDone / isExhausted read the mark), and there is nothing
 *    further to charge. For an 'on <date>' schedule the last payment is
 *    usually BEFORE the end date, and isExhausted only reads "mark >= end
 *    date", so the mark is taken to the end date in that one case: otherwise
 *    the dialog would promise "the schedule will finish" while the card kept
 *    reading Active until the end date passed. No occurrence lies between the
 *    last payment and the end date (that is what makes it the last), so
 *    nothing is skipped.
 */

/** The fields of a rule the early charge needs. RecurringRule satisfies it. */
export interface ChargeableRule extends RecurrenceSpec {
  status: string;
  materializedThrough: Ymd | null;
}

export interface ChargeNextPlan {
  /** The scheduled occurrence being charged now (its identity). */
  occurrenceDate: Ymd;
  /** The date the transaction is recorded on: the occurrence if due, else today. */
  transactionDate: Ymd;
  /** The rule's new high-water mark: the occurrence date, or the end date when
      this was the last payment of an 'on <date>' schedule (see above). */
  newMaterializedThrough: Ymd;
  /** The payment after this one, or null when this was the last. */
  nextAfter: Ymd | null;
  /** True when this charge uses up the schedule's last payment. */
  finishesRule: boolean;
  /** True when the occurrence is still in the future, so the row is dated today. */
  early: boolean;
}

/**
 * Why a rule cannot be charged now. Only 'none' needs the UI to say anything
 * beyond hiding the action: paused and finished rules are shown as such on
 * their card already.
 */
export type ChargeBlock = 'paused' | 'finished' | 'none';

/** Gap between two occurrences is at most 366 days (yearly, leap years). The
    horizon is measured from the later of the mark and today, so a rule that
    has been charged far ahead still finds its following occurrence. */
const LOOKAHEAD_DAYS = 800;

/** A one-off whose mark has reached its date has fired and never runs again. */
function isOnceFired(rule: ChargeableRule): boolean {
  return rule.frequency === 'once'
    && rule.materializedThrough !== null
    && compareYmd(rule.materializedThrough, rule.startDate) >= 0;
}

export function chargeBlockedReason(rule: ChargeableRule): ChargeBlock | null {
  if (rule.status === 'paused') return 'paused';
  if (rule.status !== 'active') return 'none';
  if (isOnceFired(rule) || isExhausted(rule, rule.materializedThrough)) return 'finished';
  return null;
}

/**
 * The plan for charging this rule's next payment now, or null when there is
 * nothing to charge (paused, finished, or no occurrence left).
 *
 * `today` is the caller's zone-aware today. Nothing here reads the clock.
 */
export function planChargeNext(rule: ChargeableRule, today: Ymd): ChargeNextPlan | null {
  if (chargeBlockedReason(rule) !== null) return null;

  const after = rule.materializedThrough ?? addDays(today, -1);
  const anchor = compareYmd(after, today) > 0 ? after : today;
  const [occurrenceDate, following] = generateOccurrences(rule, {
    after,
    through: addDays(anchor, LOOKAHEAD_DAYS),
    limit: 2,
  });
  if (occurrenceDate === undefined) return null;

  const early = compareYmd(occurrenceDate, today) > 0;
  const finishesRule = following === undefined;
  const mark = finishesRule && rule.endMode === 'on' && rule.endDate !== null && compareYmd(rule.endDate, occurrenceDate) > 0
    ? rule.endDate
    : occurrenceDate;
  return {
    occurrenceDate,
    transactionDate: early ? today : occurrenceDate,
    newMaterializedThrough: mark,
    nextAfter: following ?? null,
    finishesRule,
    early,
  };
}
