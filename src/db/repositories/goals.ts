import { toMonthKey } from '@/lib/dates';

import type { SQLiteDatabase } from 'expo-sqlite';

import type { DateOnly, Goal } from '../types';
import { newId, nowIso } from '../util';

export interface GoalInput {
  name: string;
  target_cents: number;
  deadline: DateOnly | null;
  color: string;
}

export interface GoalProgress {
  ratio: number;
  reached: boolean;
  /** Cents still to find. Negative once the target is passed. */
  remaining_cents: number;
  /**
   * What to set aside each month to arrive by the deadline, rounded up to a
   * whole unit of currency. Absent when there is no deadline or it is already
   * reached.
   */
  monthly_suggestion_cents: number | null;
}

export async function listGoals(db: SQLiteDatabase): Promise<Goal[]> {
  return db.getAllAsync<Goal>(
    'SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY sort_order, created_at',
  );
}

export async function getGoal(db: SQLiteDatabase, id: string): Promise<Goal | null> {
  return db.getFirstAsync<Goal>('SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL', [id]);
}

export async function createGoal(db: SQLiteDatabase, input: GoalInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  const next = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM goals WHERE deleted_at IS NULL',
  );

  await db.runAsync(
    `INSERT INTO goals
       (id, household_id, name, target_cents, saved_cents, deadline, color, sort_order,
        created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, 0, ?, ?, ?, ?, ?, NULL)`,
    [id, input.name, input.target_cents, input.deadline, input.color, next?.next ?? 0, now, now],
  );
  return id;
}

export async function updateGoal(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<GoalInput>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.target_cents !== undefined) {
    sets.push('target_cents = ?');
    params.push(patch.target_cents);
  }
  if (patch.deadline !== undefined) {
    sets.push('deadline = ?');
    params.push(patch.deadline);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    params.push(patch.color);
  }
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.runAsync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Moves money in or out of a goal.
 *
 * Contributions are not ledger transactions: setting money aside does not make
 * it leave your account, and counting it as spending would double-count it
 * against the month's budgets. `delta` may be negative to take money back out,
 * and the balance never goes below zero.
 */
export async function contributeToGoal(
  db: SQLiteDatabase,
  id: string,
  deltaCents: number,
): Promise<void> {
  await db.runAsync(
    'UPDATE goals SET saved_cents = MAX(0, saved_cents + ?), updated_at = ? WHERE id = ?',
    [deltaCents, nowIso(), id],
  );
}

export async function deleteGoal(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}

/** One definition of goal progress, shared by every screen that shows one. */
export function goalProgress(goal: Goal, today = new Date()): GoalProgress {
  const ratio = goal.target_cents > 0 ? goal.saved_cents / goal.target_cents : 0;
  const reached = goal.saved_cents >= goal.target_cents;
  const remaining_cents = goal.target_cents - goal.saved_cents;

  let monthly_suggestion_cents: number | null = null;
  if (!reached && goal.deadline) {
    const months = Math.max(1, monthsUntil(goal.deadline, today));
    monthly_suggestion_cents = Math.ceil(remaining_cents / months / 100) * 100;
  }

  return { ratio, reached, remaining_cents, monthly_suggestion_cents };
}

/** Whole months from now until a deadline, floored at one. */
function monthsUntil(deadline: DateOnly, today: Date): number {
  const [year, month] = deadline.split('-').map(Number);
  const [nowYear, nowMonth] = toMonthKey(today).split('-').map(Number);
  return Math.max(1, (year - nowYear) * 12 + (month - nowMonth));
}
