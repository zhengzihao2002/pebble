import type { Goal } from '@/types';
import type { Dictionary } from '@/lib/i18n';
import { t } from '@/lib/i18n';

/**
 * Pure date and pace helpers for the goals UI. Every input is a stored
 * 'YYYY-MM-DD' string (the zone-aware today, a goal's target date), compared
 * as calendar days in UTC so no browser zone or DST shift can move a day.
 * Nothing here reads the clock: callers pass today, which is null for the
 * first frame (see GoalsView), so server and client renders agree.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
// The average month, so "a month" means the same thing on every goal.
export const DAYS_PER_MONTH = 365.25 / 12;

export function isGoalDate(value: string): boolean {
  return YMD.test(value);
}

function dayNumber(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86_400_000;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

export function isReached(goal: Pick<Goal, 'current' | 'target'>): boolean {
  return goal.target > 0 && goal.current >= goal.target;
}

/**
 * "in 5 months" / "due today" / "Target passed" for a target date, or null
 * when the date is not a real date (old free-text values) or today is not
 * known yet.
 */
export function timeToTarget(d: Dictionary, today: string | null, date: string): { text: string; passed: boolean } | null {
  if (!today || !isGoalDate(date)) return null;
  const ux = d.ux.goals;
  const days = daysBetween(today, date);
  if (days < 0) return { text: ux.targetPassed, passed: true };
  if (days === 0) return { text: ux.dueToday, passed: false };
  if (days === 1) return { text: ux.dueTomorrow, passed: false };
  if (days < 45) return { text: t(ux.inDays, { n: days }), passed: false };
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months < 24) return { text: months === 1 ? ux.inOneMonth : t(ux.inMonths, { n: months }), passed: false };
  return { text: t(ux.inYears, { n: Math.round(months / 12) }), passed: false };
}

/**
 * What would need setting aside each month to reach the target on its date:
 * what is still needed over the months left, never fewer than one (a goal due
 * this month needs all of it now). Null when reached, past due, undated or
 * before today is known - there is no honest pace to show then.
 */
export function monthlyPace(goal: Pick<Goal, 'current' | 'target' | 'date'>, today: string | null): number | null {
  if (!today || !isGoalDate(goal.date) || isReached(goal)) return null;
  const days = daysBetween(today, goal.date);
  if (days < 0) return null;
  const remaining = goal.target - goal.current;
  if (remaining <= 0) return null;
  return remaining / Math.max(1, days / DAYS_PER_MONTH);
}

/**
 * Display order: goals still in progress by soonest target date (undated
 * ones last, then by name for a stable order), and reached goals apart.
 * The stored order (created_at) is unchanged; this only arranges the view.
 */
export function orderGoals(goals: Goal[]): { inProgress: Goal[]; reached: Goal[] } {
  const byDate = (a: Goal, b: Goal) => {
    const da = isGoalDate(a.date) ? a.date : '9999-99-99';
    const db = isGoalDate(b.date) ? b.date : '9999-99-99';
    return da < db ? -1 : da > db ? 1 : a.name.localeCompare(b.name);
  };
  return {
    inProgress: goals.filter((g) => !isReached(g)).sort(byDate),
    reached: goals.filter(isReached).sort(byDate),
  };
}

/** 0..1 progress, safe for a zero target. */
export function progressOf(goal: Pick<Goal, 'current' | 'target'>): number {
  return goal.target > 0 ? goal.current / goal.target : 0;
}
