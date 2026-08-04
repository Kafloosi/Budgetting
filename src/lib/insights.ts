/**
 * Plain-language observations about a month.
 *
 * Every line is derived from what is in the ledger and nothing else — no
 * encouragement, no scoring, no invented benchmarks. If there is nothing true
 * to say, this returns an empty list and the screen shows nothing.
 */

import type { CategorySpend, MonthTotals } from '@/db/repositories/transactions';
import type { MonthKey } from '@/db/types';
import { formatMonthLabel } from '@/db/util';

export interface Insight {
  /** Stable key for lists, and for the bullet's colour. */
  id: 'change' | 'top' | 'biggest' | 'left';
  text: string;
  /** The route this observation is about, when it has one. */
  color?: string | null;
}

export interface InsightInput {
  month: MonthKey;
  locale: string;
  totals: MonthTotals;
  previousTotals: MonthTotals;
  spend: CategorySpend[];
  previousSpend: CategorySpend[];
  biggest: { description: string; amount_cents: number } | null;
  formatMoney: (cents: number) => string;
}

export function computeInsights(input: InsightInput): Insight[] {
  const { totals, previousTotals, spend, previousSpend, biggest, formatMoney } = input;
  if (totals.expense_cents === 0) return [];

  const insights: Insight[] = [];
  const previousMonth = formatMonthLabel(shiftBack(input.month), input.locale);

  if (previousTotals.expense_cents > 0) {
    const change = Math.round(
      ((totals.expense_cents - previousTotals.expense_cents) / previousTotals.expense_cents) * 100,
    );
    insights.push({
      id: 'change',
      text:
        change === 0
          ? `Spending is level with ${previousMonth}.`
          : `You have spent ${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than in ${previousMonth}.`,
    });
  }

  const top = spend[0];
  if (top) {
    const previous = previousSpend.find((entry) => entry.category_id === top.category_id);
    insights.push({
      id: 'top',
      color: top.category_color,
      text: `${top.category_name ?? 'Unassigned'} is the busiest line at ${formatMoney(
        top.spent_cents,
      )}${previous ? `, against ${formatMoney(previous.spent_cents)} in ${previousMonth}` : ''}.`,
    });
  }

  if (biggest) {
    insights.push({
      id: 'biggest',
      text: `Longest single journey: ${biggest.description || 'no description'} at ${formatMoney(
        Math.abs(biggest.amount_cents),
      )}.`,
    });
  }

  if (totals.income_cents > 0) {
    const left = totals.income_cents - totals.expense_cents;
    insights.push({
      id: 'left',
      text:
        left >= 0
          ? `${formatMoney(left)} of this month's income is still unspent.`
          : `Spending is ${formatMoney(-left)} past this month's income.`,
    });
  }

  return insights;
}

function shiftBack(month: MonthKey): MonthKey {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex - 2, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}
