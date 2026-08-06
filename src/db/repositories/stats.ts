import { shiftMonth } from '@/lib/dates';

import type { SQLiteDatabase } from 'expo-sqlite';

import type { MonthKey } from '../types';
import { notATransfer } from './transfers';

export interface MonthBar {
  month: MonthKey;
  /** Positive cents. */
  income_cents: number;
  /** Positive cents. */
  expense_cents: number;
}

/**
 * The last `count` months ending at `month`, oldest first.
 *
 * Months with no transactions come back as zeroes rather than being missing,
 * because a gap in the run of bars is information: nothing was logged then.
 */
export async function getMonthBars(
  db: SQLiteDatabase,
  month: MonthKey,
  count = 6,
): Promise<MonthBar[]> {
  const first = shiftMonth(month, -(count - 1));
  const rows = await db.getAllAsync<MonthBar>(
    `SELECT substr(date, 1, 7) AS month,
            COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0)  AS income_cents,
            COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END), 0) AS expense_cents
       FROM transactions
      WHERE deleted_at IS NULL
        AND ${notATransfer()}
        AND substr(date, 1, 7) BETWEEN ? AND ?
      GROUP BY month
      ORDER BY month`,
    [first, month],
  );

  const found = new Map(rows.map((row) => [row.month, row]));
  return Array.from({ length: count }, (_, index) => {
    const key = shiftMonth(first, index);
    return found.get(key) ?? { month: key, income_cents: 0, expense_cents: 0 };
  });
}

export interface YearTotals {
  year: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
}

export async function getYearTotals(db: SQLiteDatabase, year: string): Promise<YearTotals> {
  const row = await db.getFirstAsync<Omit<YearTotals, 'year'>>(
    `SELECT COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0)  AS income_cents,
            COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END), 0) AS expense_cents,
            COALESCE(SUM(amount_cents), 0)                                      AS net_cents
       FROM transactions
      WHERE deleted_at IS NULL AND ${notATransfer()} AND substr(date, 1, 4) = ?`,
    [year],
  );
  return { year, ...(row ?? { income_cents: 0, expense_cents: 0, net_cents: 0 }) };
}

export interface CategoryYearSpend {
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  spent_cents: number;
}

/** Spending per category across a whole year, biggest first. */
export async function getYearCategorySpend(
  db: SQLiteDatabase,
  year: string,
): Promise<CategoryYearSpend[]> {
  return db.getAllAsync<CategoryYearSpend>(
    `SELECT t.category_id,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon,
            SUM(-t.amount_cents) AS spent_cents
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
        AND ${notATransfer('t')}
        AND t.amount_cents < 0
        AND substr(t.date, 1, 4) = ?
      GROUP BY t.category_id
      ORDER BY spent_cents DESC`,
    [year],
  );
}

/** Every year that has at least one transaction, newest first. */
export async function listYearsWithData(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ year: string }>(
    `SELECT DISTINCT substr(date, 1, 4) AS year
       FROM transactions
      WHERE deleted_at IS NULL
      ORDER BY year DESC`,
  );
  return rows.map((row) => row.year);
}
