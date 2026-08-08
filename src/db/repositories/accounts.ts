/**
 * Accounts — where the money actually sits.
 *
 * The table shipped in migration 1 and `account_id` was threaded through every
 * insert, but nothing ever wrote a value: every transaction in every ledger
 * belonged to one invisible account. Migration 8 seeded `seed-account-main` and
 * backfilled the existing ledger onto it, so there is always at least one account
 * and `account_id` is never null on a live row.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { Account } from '../types';
import { newId, nowIso, withTransaction } from '../util';

/** Seeded by migration 8. Every pre-accounts transaction belongs to it. */
/** Kinds offered in the picker. Free-form in the schema; these are the sensible ones. */
export const ACCOUNT_KINDS = ['checking', 'savings', 'cash', 'credit'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: 'Current',
  savings: 'Savings',
  cash: 'Cash',
  credit: 'Credit',
};

export interface AccountInput {
  name: string;
  kind: string;
  currency: string;
}

/** An account with what is in it. */
export interface AccountBalance extends Account {
  /**
   * Signed cents. A plain SUM of everything on the account, which is the balance
   * precisely because amounts are signed and transfers net to zero across a pair.
   */
  balance_cents: number;
  transaction_count: number;
}

export async function listAccounts(db: SQLiteDatabase): Promise<Account[]> {
  return db.getAllAsync<Account>(
    'SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY created_at',
  );
}

export async function getAccount(db: SQLiteDatabase, id: string): Promise<Account | null> {
  return db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL', [
    id,
  ]);
}

export async function listAccountBalances(db: SQLiteDatabase): Promise<AccountBalance[]> {
  return db.getAllAsync<AccountBalance>(
    `SELECT a.*,
            COALESCE(SUM(t.amount_cents), 0) AS balance_cents,
            COUNT(t.id) AS transaction_count
       FROM accounts a
       LEFT JOIN transactions t
              ON t.account_id = a.id AND t.deleted_at IS NULL
      WHERE a.deleted_at IS NULL
      GROUP BY a.id
      ORDER BY a.created_at`,
  );
}

/**
 * The account a new entry lands on when nothing else is chosen.
 *
 * The oldest surviving one, which is `seed-account-main` on any ledger that
 * existed before accounts were surfaced.
 */
export async function defaultAccountId(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM accounts WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1',
  );
  return row?.id ?? null;
}

export async function createAccount(db: SQLiteDatabase, input: AccountInput): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO accounts (id, household_id, name, kind, currency, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, NULL)`,
    [id, input.name.trim(), input.kind, input.currency, now, now],
  );
  return id;
}

export async function updateAccount(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<AccountInput>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  const set = (column: string, value: string | number) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.name !== undefined) set('name', patch.name.trim());
  if (patch.kind !== undefined) set('kind', patch.kind);
  if (patch.currency !== undefined) set('currency', patch.currency);
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(nowIso(), id);

  await db.runAsync(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Soft-deletes an account and moves its transactions to another one.
 *
 * The transactions are the point: an account is a label on money that was really
 * spent, so closing the label must not take the history with it. The schema's
 * `ON DELETE SET NULL` would leave rows with no account at all, which is the one
 * state the rest of the app now assumes cannot happen.
 */
export async function deleteAccount(
  db: SQLiteDatabase,
  id: string,
  moveTo: string,
): Promise<void> {
  if (id === moveTo) throw new Error('An account cannot be merged into itself.');
  const now = nowIso();

  await withTransaction(db, async (txn) => {
    await txn.runAsync(
      'UPDATE transactions SET account_id = ?, updated_at = ? WHERE account_id = ?',
      [moveTo, now, id],
    );
    await txn.runAsync('UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);
  });
}

/** How many accounts there are. The UI hides itself entirely when there is one. */
export async function countAccounts(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM accounts WHERE deleted_at IS NULL',
  );
  return row?.count ?? 0;
}
