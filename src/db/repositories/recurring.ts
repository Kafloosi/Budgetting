import { shiftDays, shiftDaysByMonth, toDateOnly } from '@/lib/dates';

import type { SQLiteDatabase } from 'expo-sqlite';

import type { DateOnly, RecurringFrequency, RecurringRule } from '../types';
import { newId, nowIso, withTransaction } from '../util';
import { defaultAccountId } from './accounts';

/** A rule that has run every day since 2000 is a bug, not a schedule. */
const MAX_CATCH_UP = 400;

export interface RecurringInput {
  amount_cents: number;
  description: string;
  category_id: string | null;
  frequency: RecurringFrequency;
  anchor_date: DateOnly;
  notes?: string | null;
}

/** A rule joined with the display fields of its category. */
export interface RecurringWithCategory extends RecurringRule {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
}

export async function listRecurring(db: SQLiteDatabase): Promise<RecurringWithCategory[]> {
  return db.getAllAsync<RecurringWithCategory>(
    `SELECT r.*,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon
       FROM recurring_rules r
       LEFT JOIN categories c ON c.id = r.category_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.anchor_date DESC`,
  );
}

export async function getRecurring(
  db: SQLiteDatabase,
  id: string,
): Promise<RecurringRule | null> {
  return db.getFirstAsync<RecurringRule>(
    'SELECT * FROM recurring_rules WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
}

export async function createRecurring(
  db: SQLiteDatabase,
  input: RecurringInput,
): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO recurring_rules
       (id, household_id, category_id, amount_cents, description, notes, frequency,
        anchor_date, last_applied_date, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    [
      id,
      input.category_id,
      input.amount_cents,
      input.description,
      input.notes ?? null,
      input.frequency,
      input.anchor_date,
      now,
      now,
    ],
  );
  return id;
}

export async function updateRecurring(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<RecurringInput>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (patch.amount_cents !== undefined) {
    sets.push('amount_cents = ?');
    params.push(patch.amount_cents);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    params.push(patch.description);
  }
  if (patch.category_id !== undefined) {
    sets.push('category_id = ?');
    params.push(patch.category_id);
  }
  if (patch.frequency !== undefined) {
    sets.push('frequency = ?');
    params.push(patch.frequency);
  }
  if (patch.anchor_date !== undefined) {
    sets.push('anchor_date = ?');
    params.push(patch.anchor_date);
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?');
    params.push(patch.notes);
  }
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.runAsync(`UPDATE recurring_rules SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Stops a rule. Entries it already created stay in the ledger — they are real
 * money that was really spent, and losing them would silently change history.
 */
export async function deleteRecurring(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    'UPDATE recurring_rules SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id],
  );
}

/** The date of a rule's k-th occurrence; k = 0 is the anchor itself. */
function occurrence(rule: RecurringRule, k: number): DateOnly {
  switch (rule.frequency) {
    case 'weekly':
      return shiftDays(rule.anchor_date, 7 * k);
    case 'biweekly':
      return shiftDays(rule.anchor_date, 14 * k);
    default:
      return shiftDaysByMonth(rule.anchor_date, k);
  }
}

/**
 * Index of the first occurrence that could still be pending.
 *
 * Derived arithmetically from `last_applied_date` rather than by walking from
 * the anchor, so a rule that has been running for five years still catches up
 * in constant time.
 */
function firstPendingIndex(rule: RecurringRule): number {
  if (!rule.last_applied_date) return 0;

  const [anchorYear, anchorMonth, anchorDay] = rule.anchor_date.split('-').map(Number);
  const [lastYear, lastMonth, lastDay] = rule.last_applied_date.split('-').map(Number);

  if (rule.frequency === 'monthly') {
    return (lastYear - anchorYear) * 12 + (lastMonth - anchorMonth) + 1;
  }

  const step = rule.frequency === 'weekly' ? 7 : 14;
  const anchorMs = Date.UTC(anchorYear, anchorMonth - 1, anchorDay);
  const lastMs = Date.UTC(lastYear, lastMonth - 1, lastDay);
  return Math.floor((lastMs - anchorMs) / 86_400_000 / step) + 1;
}

/** Every occurrence that is due but not yet written, oldest first. */
function pendingOccurrences(rule: RecurringRule, today: DateOnly): DateOnly[] {
  const dates: DateOnly[] = [];
  const start = Math.max(0, firstPendingIndex(rule));

  for (let k = start; k < start + MAX_CATCH_UP; k++) {
    const date = occurrence(rule, k);
    if (date > today) break;
    if (!rule.last_applied_date || date > rule.last_applied_date) dates.push(date);
  }

  return dates;
}

export interface CatchUpResult {
  /** Transactions written by this run. */
  created: number;
  /** Rules that had something due. */
  rules: number;
}

/**
 * Writes every occurrence that became due while the app was closed.
 *
 * Idempotent: each rule records the last date it ran, so running catch-up
 * twice in a row is a no-op. Called once when the app opens and again whenever
 * it returns to the foreground, because a phone left open overnight crosses
 * midnight without ever restarting.
 */
export async function catchUpRecurring(
  db: SQLiteDatabase,
  today: DateOnly = toDateOnly(new Date()),
): Promise<CatchUpResult> {
  const rules = await db.getAllAsync<RecurringRule>(
    'SELECT * FROM recurring_rules WHERE deleted_at IS NULL',
  );

  let created = 0;
  let touched = 0;
  // Materialised rows belong to an account like any other, so a balance is not
  // quietly missing the rent.
  const accountId = await defaultAccountId(db);

  await withTransaction(db, async (txn) => {
    for (const rule of rules) {
      const dates = pendingOccurrences(rule, today);
      if (dates.length === 0) continue;
      touched++;

      const now = nowIso();
      for (const date of dates) {
        await txn.runAsync(
          `INSERT INTO transactions
             (id, household_id, account_id, category_id, amount_cents, date, description,
              notes, source, import_hash, recurring_id, created_at, updated_at, deleted_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?, ?, NULL)`,
          [
            newId(),
            accountId,
            rule.category_id,
            rule.amount_cents,
            date,
            rule.description,
            rule.notes,
            rule.id,
            now,
            now,
          ],
        );
        created++;
      }

      await txn.runAsync(
        'UPDATE recurring_rules SET last_applied_date = ?, updated_at = ? WHERE id = ?',
        [dates[dates.length - 1], now, rule.id],
      );
    }
  });

  return { created, rules: touched };
}

/** The next date a rule will fire, for the timetable listing. */
export function nextOccurrence(rule: RecurringRule, today = toDateOnly(new Date())): DateOnly {
  const start = Math.max(0, firstPendingIndex(rule));
  for (let k = start; k < start + MAX_CATCH_UP; k++) {
    const date = occurrence(rule, k);
    if (date > today) return date;
  }
  return occurrence(rule, start);
}

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every two weeks',
  monthly: 'Every month',
};
