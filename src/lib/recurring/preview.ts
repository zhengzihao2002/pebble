import { addDays, generateOccurrences } from '@/lib/recurring/occurrences';
import type { RecurringRule, UpcomingOccurrence } from '@/types';

export const SCHEDULE_PREVIEW_DAYS = 60;

export function getUpcomingSchedule(rules: RecurringRule[], today: string, { afterTodayOnly = true } = {}): UpcomingOccurrence[] {
  const horizon = addDays(today, SCHEDULE_PREVIEW_DAYS);

  const yesterday = addDays(today, -1);

  // Same generator that materializes, run forward - a preview can never
  // disagree with what will actually be created.
  const upcoming: UpcomingOccurrence[] = rules
    .filter((rule) => rule.status === 'active')
    .flatMap((rule) =>
      generateOccurrences(rule, {
        // Exclusive lower bound. Catch-up ran above, so this is today for any
        // rule that has ever fired - today's occurrence already exists and must
        // not appear here as though it were still to come.
        after: afterTodayOnly && (!rule.materializedThrough || rule.materializedThrough < yesterday) ? yesterday : rule.materializedThrough ?? yesterday,
        through: horizon,
        limit: 40,
      }).map((date) => ({
        ruleId: rule.id,
        description: rule.description,
        category: rule.category,
        kind: rule.kind,
        paymentMethod: rule.paymentMethod,
        amount: rule.amount,
        date,
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return upcoming;
}
