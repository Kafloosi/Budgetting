/**
 * Moving money between your own accounts.
 *
 * A transfer is not spending and it is not income — it is the same money in a
 * different place. Recorded as two sibling rows sharing a `transfer_group_id`:
 * negative in the account it left, positive in the one it arrived in, neither
 * carrying a category.
 *
 * No parent row. The pair sums to zero, so a total over the whole ledger stays
 * true and each account's balance moves by exactly the right amount, with nothing
 * to remember to exclude. What does have to be excluded is the pair from every
 * spend and income aggregate — see `NOT_A_TRANSFER`.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { DateOnly } from '../types';
import { newId, nowIso, withTransaction } from '../util';

/**
 * The clause every spend or income aggregate needs.
 *
 * Exported as one string so all of them say it the same way and a grep finds every
 * site at once. Takes the table alias because half the queries join.
 */
export function notATransfer(alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}transfer_group_id IS NULL`;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  /** Positive cents. The direction is carried by which account is which. */
  amountCents: number;
  date: DateOnly;
  description?: string;
  notes?: string | null;
}

/**
 * Writes both halves in one transaction.
 *
 * Either both rows exist or neither does. A half-written transfer would show money
 * leaving an account and never arriving, which is worse than a failed transfer
 * because it looks like a real loss.
 */
export async function createTransfer(
  db: SQLiteDatabase,
  input: TransferInput,
): Promise<string> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Pick two different accounts.');
  }
  if (input.amountCents <= 0) {
    throw new Error('A transfer needs an amount.');
  }

  const groupId = newId();
  const now = nowIso();
  const description = input.description?.trim() || 'Transfer';

  await withTransaction(db, async (txn) => {
    const insert = async (accountId: string, amountCents: number) => {
      await txn.runAsync(
        `INSERT INTO transactions
           (id, household_id, account_id, category_id, amount_cents, date, description,
            notes, source, import_hash, recurring_id, transfer_group_id,
            created_at, updated_at, deleted_at)
         VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 'manual', NULL, NULL, ?, ?, ?, NULL)`,
        [
          newId(),
          accountId,
          amountCents,
          input.date,
          description,
          input.notes ?? null,
          groupId,
          now,
          now,
        ],
      );
    };

    await insert(input.fromAccountId, -input.amountCents);
    await insert(input.toAccountId, input.amountCents);
  });

  return groupId;
}

/**
 * Deletes both halves of a transfer.
 *
 * Soft, like every other delete, and both sides together — trashing one leg would
 * leave the other as a mysterious unexplained credit.
 */
export async function deleteTransfer(db: SQLiteDatabase, groupId: string): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `UPDATE transactions SET deleted_at = ?, updated_at = ?
      WHERE transfer_group_id = ? AND deleted_at IS NULL`,
    [now, now, groupId],
  );
}

export interface TransferSummary {
  transfer_group_id: string;
  date: DateOnly;
  description: string;
  /** Positive cents moved. */
  amount_cents: number;
  from_account: string | null;
  to_account: string | null;
}

/** Transfers, newest first, with both account names resolved. */
export async function listTransfers(
  db: SQLiteDatabase,
  limit = 100,
): Promise<TransferSummary[]> {
  return db.getAllAsync<TransferSummary>(
    `SELECT t.transfer_group_id,
            MAX(t.date)        AS date,
            MAX(t.description) AS description,
            MAX(t.amount_cents) AS amount_cents,
            MAX(CASE WHEN t.amount_cents < 0 THEN a.name END) AS from_account,
            MAX(CASE WHEN t.amount_cents > 0 THEN a.name END) AS to_account
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.transfer_group_id IS NOT NULL AND t.deleted_at IS NULL
      GROUP BY t.transfer_group_id
      ORDER BY date DESC, t.created_at DESC
      LIMIT ?`,
    [limit],
  );
}
