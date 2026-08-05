/**
 * Where this month is heading, projected from the pace so far.
 *
 * The point is to make overspending visible on the 12th rather than the 30th.
 * In the diagram's own terms: the month line already shows where you are, and
 * the forecast shows where the service is scheduled to terminate if it keeps
 * running at this speed.
 */

import type { BudgetProgress } from '@/db/repositories/budgets';
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

export interface RouteForecast extends BudgetProgress {
  /** Positive cents this route is heading for by the end of the month. */
  projected_cents: number;
  /** Projected spend past the limit. Zero when it stays inside. */
  projected_over_cents: number;
}

/**
 * The same projection per budgeted route, worst first.
 *
 * A route already over its limit needs no forecast to be alarming, so this is
 * about the ones still inside it that will not stay there.
 */
export function forecastRoutes(
  month: MonthKey,
  progress: BudgetProgress[],
  today = new Date(),
): RouteForecast[] {
  const totalDays = daysInMonth(month);
  const elapsedDays = Math.max(1, elapsedDaysInMonth(month, today));

  return progress
    .map((entry) => {
      const projected_cents = Math.round((entry.spent_cents / elapsedDays) * totalDays);
      return {
        ...entry,
        projected_cents,
        projected_over_cents: Math.max(0, projected_cents - entry.limit_cents),
      };
    })
    .sort((a, b) => overshoot(b) - overshoot(a));
}

function overshoot(route: RouteForecast): number {
  // A limit of zero cannot be divided by, and is the worst offender there is
  // the moment anything at all is projected against it.
  if (route.limit_cents > 0) return route.projected_cents / route.limit_cents;
  return route.projected_cents > 0 ? Number.MAX_SAFE_INTEGER : 0;
}
