import { monthBounds, shiftMonth } from '@/lib/dates';

import type { SQLiteDatabase } from 'expo-sqlite';

import type { MonthKey } from '../types';
import { newId, nowIso } from '../util';
import { notATransfer } from './transfers';

/** Fraction of the limit at which a category starts warning. */
export const WARNING_THRESHOLD = 0.8;

/**
 * How many months back a carried balance is accumulated from.
 *
 * Bounded because the alternative is unbounded: a two-year-old ledger would
 * produce a number nobody could account for, and a carried balance you cannot
 * explain is worse than no carried balance. A year is long enough that a
 * seasonal category still balances out.
 */
export const ROLLOVER_WINDOW_MONTHS = 12;

export type BudgetStatus = 'under' | 'warning' | 'over';

export interface BudgetProgress {
  category_id: string;
  category_name: string;
  category_color: string;
  category_icon: string;
  limit_cents: number;
  /** Positive cents spent this month. */
  spent_cents: number;
  /** Whether this category carries its leftovers forward. */
  rollover: boolean;
  /**
   * Carried in from earlier months — positive when underspent, negative when a
   * past overspend is still being paid off. Always 0 when `rollover` is false.
   */
  carry_in_cents: number;
  /** `limit_cents + carry_in_cents`. What this month can actually take. */
  effective_limit_cents: number;
  /** Negative once the effective limit is blown. */
  remaining_cents: number;
  /** Spent / effective limit. Can exceed 1. */
  ratio: number;
  status: BudgetStatus;
}

function statusFor(ratio: number): BudgetStatus {
  if (ratio > 1) return 'over';
  if (ratio >= WARNING_THRESHOLD) return 'warning';
  return 'under';
}

/** A category's limit for a month: the month's own row, else the recurring one. */
function limitForMonth(
  rows: { month: MonthKey | null; limit_cents: number }[],
  month: MonthKey,
): number | null {
  let recurring: number | null = null;
  for (const row of rows) {
    if (row.month === month) return row.limit_cents;
    if (row.month === null) recurring = row.limit_cents;
  }
  return recurring;
}

/**
 * What each rollover category brings into `month` from the months before it.
 *
 * Computed rather than stored. The sum is signed, so an overspend genuinely eats
 * into the next month instead of being quietly forgiven, and a later underspend
 * pays it back. Months with no limit contribute nothing — there was no envelope
 * to have anything left in.
 */
async function carryInByCategory(
  db: SQLiteDatabase,
  month: MonthKey,
  categories: { category_id: string; rollover_since: MonthKey | null }[],
): Promise<Record<string, number>> {
  const carry: Record<string, number> = {};
  if (categories.length === 0) return carry;

  const categoryIds = categories.map((entry) => entry.category_id);
  const windowStart = shiftMonth(month, -ROLLOVER_WINDOW_MONTHS);
  const { start } = monthBounds(windowStart);
  // Up to the day before this month begins.
  const { start: monthStart } = monthBounds(month);

  const placeholders = categoryIds.map(() => '?').join(', ');

  const budgetRows = await db.getAllAsync<{
    category_id: string;
    month: MonthKey | null;
    limit_cents: number;
  }>(
    `SELECT category_id, month, limit_cents
       FROM budgets
      WHERE deleted_at IS NULL AND category_id IN (${placeholders})`,
    categoryIds,
  );

  const spendRows = await db.getAllAsync<{
    category_id: string;
    month: MonthKey;
    spent_cents: number;
  }>(
    `SELECT category_id,
            substr(date, 1, 7) AS month,
            SUM(-amount_cents) AS spent_cents
       FROM transactions
      WHERE deleted_at IS NULL
        AND ${notATransfer()}
        AND amount_cents < 0
        AND category_id IN (${placeholders})
        AND date >= ?
        AND date < ?
      GROUP BY category_id, month`,
    [...categoryIds, start, monthStart],
  );

  const spent = new Map<string, number>();
  for (const row of spendRows) {
    spent.set(`${row.category_id}|${row.month}`, row.spent_cents);
  }

  for (const { category_id: categoryId, rollover_since: since } of categories) {
    const rows = budgetRows.filter((row) => row.category_id === categoryId);
    let total = 0;
    for (let back = ROLLOVER_WINDOW_MONTHS; back >= 1; back--) {
      const past = shiftMonth(month, -back);
      // Nothing before the switch was flipped. A quiet year is not savings.
      if (since && past < since) continue;
      const limit = limitForMonth(rows, past);
      if (limit === null) continue;
      total += limit - (spent.get(`${categoryId}|${past}`) ?? 0);
    }
    carry[categoryId] = total;
  }

  return carry;
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
    rollover: number;
    rollover_since: MonthKey | null;
  }>(
    `WITH spend AS (
       SELECT category_id, SUM(-amount_cents) AS spent_cents
         FROM transactions
        WHERE deleted_at IS NULL
          AND ${notATransfer()}
          AND amount_cents < 0
          AND date BETWEEN ? AND ?
        GROUP BY category_id
     ),
     limits AS (
       SELECT category_id,
              COALESCE(
                MAX(CASE WHEN month = ?    THEN limit_cents END),
                MAX(CASE WHEN month IS NULL THEN limit_cents END)
              ) AS limit_cents,
              -- Held on every row for the category, so any of them answers.
              MAX(rollover) AS rollover,
              MAX(rollover_since) AS rollover_since
         FROM budgets
        WHERE deleted_at IS NULL AND (month = ? OR month IS NULL)
        GROUP BY category_id
     )
     SELECT c.id    AS category_id,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon,
            l.limit_cents,
            l.rollover,
            l.rollover_since,
            COALESCE(s.spent_cents, 0) AS spent_cents
       FROM categories c
       JOIN limits l ON l.category_id = c.id
       LEFT JOIN spend s ON s.category_id = c.id
      WHERE c.deleted_at IS NULL AND l.limit_cents IS NOT NULL
      ORDER BY c.sort_order, c.name`,
    [start, end, month, month],
  );

  const carry = await carryInByCategory(
    db,
    month,
    rows.filter((row) => row.rollover === 1),
  );

  return rows.map((row) => {
    const carryIn = carry[row.category_id] ?? 0;
    const effective = row.limit_cents + carryIn;

    // A category that carried a debt bigger than this month's limit has nothing
    // to spend. Dividing by that is either a divide-by-zero or a negative ratio
    // that reads as "under", so it is answered directly instead.
    const ratio =
      effective > 0 ? row.spent_cents / effective : row.spent_cents > 0 ? Infinity : 1;

    return {
      ...row,
      rollover: row.rollover === 1,
      carry_in_cents: carryIn,
      effective_limit_cents: effective,
      remaining_cents: effective - row.spent_cents,
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

  // A new row inherits the category's setting, so adding a March override to a
  // category that carries over does not silently stop it carrying over.
  const inherited = await db.getFirstAsync<{ rollover: number }>(
    'SELECT MAX(rollover) AS rollover FROM budgets WHERE category_id = ? AND deleted_at IS NULL',
    [categoryId],
  );

  await db.runAsync(
    `INSERT INTO budgets
       (id, household_id, category_id, month, limit_cents, rollover, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL)`,
    [newId(), categoryId, month, limitCents, inherited?.rollover ?? 0, now, now],
  );
}

/**
 * Turns carrying over on or off for a category.
 *
 * Written to every one of its budget rows, because the setting describes the
 * category's limit rather than one month of it, and reading it back with
 * `MAX(rollover)` then cannot disagree with itself.
 */
export async function setRollover(
  db: SQLiteDatabase,
  categoryId: string,
  on: boolean,
  /** The month being viewed when it was switched on. Carrying starts here. */
  from: MonthKey,
): Promise<void> {
  const now = nowIso();

  if (!on) {
    await db.runAsync(
      `UPDATE budgets SET rollover = 0, rollover_since = NULL, updated_at = ?
        WHERE category_id = ? AND deleted_at IS NULL`,
      [now, categoryId],
    );
    return;
  }

  // Already on: leave the start month alone, or saving a limit again would
  // silently move it and wipe the balance built up since.
  const existing = await db.getFirstAsync<{ since: MonthKey | null }>(
    `SELECT MAX(rollover_since) AS since FROM budgets
      WHERE category_id = ? AND deleted_at IS NULL AND rollover = 1`,
    [categoryId],
  );

  await db.runAsync(
    `UPDATE budgets SET rollover = 1, rollover_since = ?, updated_at = ?
      WHERE category_id = ? AND deleted_at IS NULL`,
    [existing?.since ?? from, now, categoryId],
  );
}

/** Whether a category carries its leftovers forward. For the edit screen. */
export async function getRollover(db: SQLiteDatabase, categoryId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ rollover: number | null }>(
    'SELECT MAX(rollover) AS rollover FROM budgets WHERE category_id = ? AND deleted_at IS NULL',
    [categoryId],
  );
  return row?.rollover === 1;
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
