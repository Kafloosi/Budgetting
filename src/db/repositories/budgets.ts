import type { SQLiteDatabase } from 'expo-sqlite';

import type { MonthKey } from '../types';
import { monthBounds, newId, nowIso } from '../util';

/** Fraction of the limit at which a category starts warning. */
export const WARNING_THRESHOLD = 0.8;

export type BudgetStatus = 'under' | 'warning' | 'over';

export interface BudgetProgress {
  category_id: string;
  category_name: string;
  category_color: string;
  category_icon: string;
  limit_cents: number;
  /** Positive cents spent this month. */
  spent_cents: number;
  /** Negative once the limit is blown. */
  remaining_cents: number;
  /** Spent / limit. Can exceed 1. */
  ratio: number;
  status: BudgetStatus;
}

function statusFor(ratio: number): BudgetStatus {
  if (ratio > 1) return 'over';
  if (ratio >= WARNING_THRESHOLD) return 'warning';
  return 'under';
}

/**
 * Budget progress for every category that has a limit in `month`.
 *
 * A category's limit is its month-specific override if one exists, otherwise
 * its recurring limit — that fallback is what the two MAX(CASE ...) arms do.
 */
export async function getBudgetProgress(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<BudgetProgress[]> {
  const { start, end } = monthBounds(month);

  const rows = await db.getAllAsync<{
    category_id: string;
    category_name: string;
    category_color: string;
    category_icon: string;
    limit_cents: number;
    spent_cents: number;
  }>(
    `WITH spend AS (
       SELECT category_id, SUM(-amount_cents) AS spent_cents
         FROM transactions
        WHERE deleted_at IS NULL
          AND amount_cents < 0
          AND date BETWEEN ? AND ?
        GROUP BY category_id
     ),
     limits AS (
       SELECT category_id,
              COALESCE(
                MAX(CASE WHEN month = ?    THEN limit_cents END),
                MAX(CASE WHEN month IS NULL THEN limit_cents END)
              ) AS limit_cents
         FROM budgets
        WHERE deleted_at IS NULL AND (month = ? OR month IS NULL)
        GROUP BY category_id
     )
     SELECT c.id    AS category_id,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon,
            l.limit_cents,
            COALESCE(s.spent_cents, 0) AS spent_cents
       FROM categories c
       JOIN limits l ON l.category_id = c.id
       LEFT JOIN spend s ON s.category_id = c.id
      WHERE c.deleted_at IS NULL AND l.limit_cents IS NOT NULL
      ORDER BY c.sort_order, c.name`,
    [start, end, month, month],
  );

  return rows.map((row) => {
    const ratio = row.limit_cents > 0 ? row.spent_cents / row.limit_cents : 0;
    return {
      ...row,
      remaining_cents: row.limit_cents - row.spent_cents,
      ratio,
      status: statusFor(ratio),
    };
  });
}

/**
 * Sets a limit for a category.
 *
 * `month` of null sets the recurring limit that applies to every month; a
 * `YYYY-MM` value overrides just that month. Upserts against the partial unique
 * index, so calling it twice updates rather than duplicating.
 */
export async function setBudget(
  db: SQLiteDatabase,
  categoryId: string,
  month: MonthKey | null,
  limitCents: number,
): Promise<void> {
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM budgets
      WHERE category_id = ? AND deleted_at IS NULL
        AND COALESCE(month, '*') = COALESCE(?, '*')`,
    [categoryId, month],
  );

  if (existing) {
    await db.runAsync('UPDATE budgets SET limit_cents = ?, updated_at = ? WHERE id = ?', [
      limitCents,
      now,
      existing.id,
    ]);
    return;
  }

  await db.runAsync(
    `INSERT INTO budgets
       (id, household_id, category_id, month, limit_cents, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, NULL)`,
    [newId(), categoryId, month, limitCents, now, now],
  );
}

export async function removeBudget(
  db: SQLiteDatabase,
  categoryId: string,
  month: MonthKey | null,
): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `UPDATE budgets SET deleted_at = ?, updated_at = ?
      WHERE category_id = ? AND deleted_at IS NULL
        AND COALESCE(month, '*') = COALESCE(?, '*')`,
    [now, now, categoryId, month],
  );
}

/** The recurring limit per category, keyed by category id. For the edit screen. */
export async function getRecurringLimits(
  db: SQLiteDatabase,
): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ category_id: string; limit_cents: number }>(
    'SELECT category_id, limit_cents FROM budgets WHERE month IS NULL AND deleted_at IS NULL',
  );
  return Object.fromEntries(rows.map((row) => [row.category_id, row.limit_cents]));
}
