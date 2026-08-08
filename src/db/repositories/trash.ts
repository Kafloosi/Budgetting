import type { SQLiteDatabase } from 'expo-sqlite';

import type { TransactionWithCategory } from './transactions';
import { nowIso } from '../util';

/**
 * How long a deleted entry stays recoverable — long enough to catch a mistake
 * noticed at the end of the month, short enough that the trash never becomes a
 * second copy of the ledger.
 */
export const TRASH_RETENTION_DAYS = 30;

export interface TrashedTransaction extends TransactionWithCategory {
  /** Whole days left before this row is swept, floored at zero. */
  days_left: number;
}

/**
 * Deleted transactions, newest first.
 *
 * Every other query in the app filters `deleted_at IS NULL`; this is the one
 * place that looks at what was thrown away.
 */
export async function listTrash(db: SQLiteDatabase): Promise<TrashedTransaction[]> {
  const rows = await db.getAllAsync<TransactionWithCategory>(
    `SELECT t.*,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NOT NULL
      ORDER BY t.deleted_at DESC
      LIMIT 300`,
  );

  const now = Date.now();
  return rows.map((row) => {
    const deletedAt = Date.parse(row.deleted_at ?? '');
    // An unreadable timestamp counts as fully expired rather than brand new,
    // so a corrupt row cannot sit in the trash forever.
    const age = Number.isNaN(deletedAt)
      ? TRASH_RETENTION_DAYS
      : Math.max(0, Math.floor((now - deletedAt) / 86_400_000));
    return { ...row, days_left: Math.max(0, TRASH_RETENTION_DAYS - age) };
  });
}

/** Puts a deleted transaction back into the ledger. */
export async function restoreTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
    nowIso(),
    id,
  ]);
}

/** Empties the trash. */
export async function purgeAll(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync('DELETE FROM transactions WHERE deleted_at IS NOT NULL');
  await reclaim(db, result.changes);
  return result.changes;
}

/**
 * Returns the freed pages to the filesystem.
 *
 * `secure_delete` overwrites a deleted row's bytes, but the page stays in the file
 * and the file never shrinks on its own — so the size of someone's database still
 * hints at how much they once had in it. VACUUM rewrites it.
 *
 * Cannot run inside a transaction, and rewrites the whole file, so it is only worth
 * it when something was actually purged.
 */
async function reclaim(db: SQLiteDatabase, purged: number): Promise<void> {
  if (purged === 0) return;
  await db.execAsync('VACUUM;');
}

/**
 * Drops anything past its retention. Runs on every app open alongside the
 * recurring catch-up, so the trash empties itself without the user ever having
 * to think about it.
 */
export async function purgeExpired(db: SQLiteDatabase): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  const result = await db.runAsync(
    'DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [cutoff],
  );
  await reclaim(db, result.changes);
  return result.changes;
}
