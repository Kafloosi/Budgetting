/**
 * One payment across several lines.
 *
 * A supermarket shop is groceries and household. Splitting it replaces the single
 * row with sibling rows sharing a `split_group_id`, each with its own category and
 * its own share of the money. The parts add up to the original, so every total,
 * budget and forecast stays correct without knowing splits exist.
 *
 * No parent row, for the same reason transfers have none: a row holding the total
 * would have to be excluded from every aggregate, and one missed exclusion counts
 * the receipt twice.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { Transaction } from '../types';
import { newId, nowIso, withTransaction } from '../util';

export interface SplitPart {
  /** Signed cents, same sign as the original. */
  amount_cents: number;
  category_id: string | null;
  notes?: string | null;
}

/**
 * Replaces a transaction with its parts.
 *
 * The parts must sum to the original exactly. Anything else is a rounding error
 * someone will find in a total months later, so it is refused rather than
 * absorbed — cents do not get to disappear quietly.
 *
 * The original row is deleted rather than kept as a container, and one part
 * inherits its `import_hash` so re-importing the statement it came from is still a
 * no-op. The rest carry null, because the partial unique index only tolerates one
 * row per hash.
 */
export async function splitTransaction(
  db: SQLiteDatabase,
  id: string,
  parts: SplitPart[],
): Promise<string> {
  if (parts.length < 2) throw new Error('A split needs at least two parts.');

  const original = await db.getFirstAsync<Transaction>(
    'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (!original) throw new Error('That transaction is no longer there.');
  if (original.transfer_group_id) {
    throw new Error('A transfer between accounts cannot be split.');
  }

  const total = parts.reduce((sum, part) => sum + part.amount_cents, 0);
  if (total !== original.amount_cents) {
    throw new Error('The parts have to add up to the original amount.');
  }
  if (parts.some((part) => part.amount_cents === 0)) {
    throw new Error('A part cannot be zero.');
  }
  // Mixing signs would turn one expense into an expense plus income, which is a
  // different transaction rather than a split of this one.
  if (parts.some((part) => Math.sign(part.amount_cents) !== Math.sign(original.amount_cents))) {
    throw new Error('Every part has to go the same way as the original.');
  }

  const groupId = original.split_group_id ?? newId();
  const now = nowIso();

  await withTransaction(db, async (txn) => {
    await txn.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);

    for (const [index, part] of parts.entries()) {
      await txn.runAsync(
        `INSERT INTO transactions
           (id, household_id, account_id, category_id, amount_cents, date, description,
            notes, source, import_hash, recurring_id, transfer_group_id, split_group_id,
            created_at, updated_at, deleted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)`,
        [
          newId(),
          original.account_id,
          part.category_id,
          part.amount_cents,
          original.date,
          original.description,
          part.notes ?? original.notes,
          original.source,
          // Only the first part keeps it; the unique index allows exactly one.
          index === 0 ? original.import_hash : null,
          original.recurring_id,
          groupId,
          now,
          now,
        ],
      );
    }
  });

  return groupId;
}

/** The parts of a split, for showing them together in the ledger. */
export async function listSplitParts(
  db: SQLiteDatabase,
  groupId: string,
): Promise<Transaction[]> {
  return db.getAllAsync<Transaction>(
    `SELECT * FROM transactions
      WHERE split_group_id = ? AND deleted_at IS NULL
      ORDER BY created_at`,
    [groupId],
  );
}

/**
 * Puts a split back together as one row.
 *
 * The reverse of splitting, for when it was a mistake. The categories of the parts
 * are gone — there is only one category on the recombined row — so it takes the
 * largest part's, which is the least surprising answer.
 */
export async function unsplitTransaction(db: SQLiteDatabase, groupId: string): Promise<string> {
  const parts = await listSplitParts(db, groupId);
  if (parts.length === 0) throw new Error('That split is no longer there.');

  const total = parts.reduce((sum, part) => sum + part.amount_cents, 0);
  const biggest = parts.reduce((largest, part) =>
    Math.abs(part.amount_cents) > Math.abs(largest.amount_cents) ? part : largest,
  );
  const withHash = parts.find((part) => part.import_hash !== null);
  const id = newId();
  const now = nowIso();

  await withTransaction(db, async (txn) => {
    for (const part of parts) {
      await txn.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        now,
        now,
        part.id,
      ]);
    }

    await txn.runAsync(
      `INSERT INTO transactions
         (id, household_id, account_id, category_id, amount_cents, date, description,
          notes, source, import_hash, recurring_id, transfer_group_id, split_group_id,
          created_at, updated_at, deleted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
      [
        id,
        biggest.account_id,
        biggest.category_id,
        total,
        biggest.date,
        biggest.description,
        biggest.notes,
        biggest.source,
        withHash?.import_hash ?? null,
        biggest.recurring_id,
        now,
        now,
      ],
    );
  });

  return id;
}
