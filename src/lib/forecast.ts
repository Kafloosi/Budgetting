/**
 * Where this month is heading, projected from the pace so far.
 *
 * The point is to make overspending visible on the 12th rather than the 30th.
 * In the diagram's own terms: the month line already shows where you are, and
 * the forecast shows where the service is scheduled to terminate if it keeps
 * running at this speed.
 */

import type { MonthTotals } from '@/db/repositories/transactions';
import type { MonthKey } from '@/db/types';
import { daysInMonth, elapsedDaysInMonth } from '@/lib/dates';

/**
 * Under this many days a projection is noise dressed as a number.
 *
 * A week, not three days: rent and other fixed costs land in the first days of
 * a month, and multiplying day four's total by thirty-one produces a confident
 * figure several times the truth. A week is long enough for the fixed costs to
 * be diluted by ordinary spending.
 */
const MIN_DAYS = 7;

export interface Forecast {
  elapsedDays: number;
  totalDays: number;
  /** Positive cents spent so far. */
  spentCents: number;
  /** Positive cents per day, averaged over the days lived. */
  dailyPaceCents: number;
  /** Positive cents this month is heading for at that pace. */
  projectedCents: number;
  incomeCents: number;
  /** Projected spend beyond income. Zero or negative means it fits. */
  projectedOverspendCents: number;
  /** What is safe to spend per remaining day to stay inside income. */
  safeDailyCents: number;
  /** False early in the month, or with nothing spent yet. */
  reliable: boolean;
}

export function forecastMonth(
  month: MonthKey,
  totals: MonthTotals,
  today = new Date(),
): Forecast {
  const totalDays = daysInMonth(month);
  const elapsedDays = Math.max(1, elapsedDaysInMonth(month, today));
  const remainingDays = Math.max(1, totalDays - elapsedDays);

  const dailyPaceCents = Math.round(totals.expense_cents / elapsedDays);
  const projectedCents = dailyPaceCents * totalDays;

  return {
    elapsedDays,
    totalDays,
    spentCents: totals.expense_cents,
    dailyPaceCents,
    projectedCents,
    incomeCents: totals.income_cents,
    projectedOverspendCents: projectedCents - totals.income_cents,
    safeDailyCents: Math.max(
      0,
      Math.round((totals.income_cents - totals.expense_cents) / remainingDays),
    ),
    reliable:
      elapsedDaysInMonth(month, today) >= MIN_DAYS &&
      totals.expense_cents > 0 &&
      totals.income_cents > 0,
  };
}
