import { monthBounds } from '@/lib/dates';

import type { SQLiteDatabase } from 'expo-sqlite';

import type { DateOnly, MonthKey, Transaction, TransactionSource } from '../types';
import { newId, nowIso, withTransaction } from '../util';
import { defaultAccountId } from './accounts';
import { notATransfer } from './transfers';

export interface TransactionInput {
  /** Signed cents: negative for spending, positive for income. */
  amount_cents: number;
  date: DateOnly;
  description: string;
  category_id: string | null;
  account_id?: string | null;
  notes?: string | null;
  source?: TransactionSource;
  import_hash?: string | null;
}

/** A transaction joined with the display fields of its category. */
export interface TransactionWithCategory extends Transaction {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
}

export interface TransactionQuery {
  month?: MonthKey;
  categoryId?: string;
  /** Only rows with no category yet — the triage queue. Ignores `categoryId`. */
  uncategorised?: boolean;
  /** Case-insensitive substring match on description and notes. */
  search?: string;
  /** `out` is spending, `in` is income. Omit for both. */
  direction?: 'in' | 'out';
  limit?: number;
  offset?: number;
}

function buildFilter(query: TransactionQuery): { where: string; params: (string | number)[] } {
  const clauses = ['t.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  if (query.month) {
    const { start, end } = monthBounds(query.month);
    clauses.push('t.date BETWEEN ? AND ?');
    params.push(start, end);
  }
  if (query.uncategorised) {
    clauses.push('t.category_id IS NULL');
  } else if (query.categoryId) {
    clauses.push('t.category_id = ?');
    params.push(query.categoryId);
  }
  if (query.search) {
    clauses.push('(t.description LIKE ? COLLATE NOCASE OR t.notes LIKE ? COLLATE NOCASE)');
    const like = `%${query.search}%`;
    params.push(like, like);
  }
  if (query.direction) {
    clauses.push(query.direction === 'in' ? 't.amount_cents > 0' : 't.amount_cents < 0');
  }

  return { where: clauses.join(' AND '), params };
}

export async function listTransactions(
  db: SQLiteDatabase,
  query: TransactionQuery = {},
): Promise<TransactionWithCategory[]> {
  const { where, params } = buildFilter(query);
  const limit = query.limit ?? 500;
  const offset = query.offset ?? 0;

  return db.getAllAsync<TransactionWithCategory>(
    `SELECT t.*,
            c.name  AS category_name,
            c.color AS category_color,
            c.icon  AS category_icon
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE ${where}
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}

/** How many rows are waiting to be filed. Drives the triage prompt. */
export async function countUncategorised(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NULL AND category_id IS NULL',
  );
  return row?.count ?? 0;
}

export async function getTransaction(
  db: SQLiteDatabase,
  id: string,
): Promise<Transaction | null> {
  return db.getFirstAsync<Transaction>(
    'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
}

export async function createTransaction(
  db: SQLiteDatabase,
  input: TransactionInput,
): Promise<string> {
  const id = newId();
  const now = nowIso();

  // Since accounts were surfaced, a live row always belongs to one. Falling back
  // to the default rather than null keeps every balance and account filter honest
  // without every caller having to know an account exists.
  const accountId = input.account_id ?? (await defaultAccountId(db));

  await db.runAsync(
    `INSERT INTO transactions
       (id, household_id, account_id, category_id, amount_cents, date, description,
        notes, source, import_hash, created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      accountId,
      input.category_id,
      input.amount_cents,
      input.date,
      input.description,
      input.notes ?? null,
      input.source ?? 'manual',
      input.import_hash ?? null,
      now,
      now,
    ],
  );

  return id;
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<TransactionInput>,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  const set = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.amount_cents !== undefined) set('amount_cents', patch.amount_cents);
  if (patch.date !== undefined) set('date', patch.date);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.category_id !== undefined) set('category_id', patch.category_id);
  if (patch.account_id !== undefined) set('account_id', patch.account_id);
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  params.push(nowIso(), id);

  await db.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    now,
    now,
    id,
  ]);
}

export interface BulkInsertResult {
  inserted: number;
  skipped: number;
}

/**
 * Inserts imported rows, skipping any whose `import_hash` is already present.
 *
 * The dedupe leans on the partial unique index rather than a pre-flight SELECT,
 * so a statement that overlaps a previous import cannot slip a duplicate
 * through between the check and the write.
 */
export async function bulkInsertImported(
  db: SQLiteDatabase,
  rows: TransactionInput[],
): Promise<BulkInsertResult> {
  let inserted = 0;
  const now = nowIso();
  // Resolved once for the whole statement rather than per row.
  const fallbackAccount = await defaultAccountId(db);

  await withTransaction(db, async (txn) => {
    for (const row of rows) {
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, household_id, account_id, category_id, amount_cents, date, description,
            notes, source, import_hash, created_at, updated_at, deleted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, NULL)`,
        [
          newId(),
          row.account_id ?? fallbackAccount,
          row.category_id,
          row.amount_cents,
          row.date,
          row.description,
          row.notes ?? null,
          row.import_hash ?? null,
          now,
          now,
        ],
      );
      if (result.changes > 0) inserted++;
    }
  });

  return { inserted, skipped: rows.length - inserted };
}

export interface MonthTotals {
  /** Positive cents received. */
  income_cents: number;
  /** Positive cents spent. */
  expense_cents: number;
  /** Signed: income minus spending. */
  net_cents: number;
  count: number;
}

/** The month in three numbers, for the top of the Month screen. */
export async function getMonthTotals(db: SQLiteDatabase, month: MonthKey): Promise<MonthTotals> {
  const { start, end } = monthBounds(month);
  const row = await db.getFirstAsync<MonthTotals>(
    `SELECT COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0)  AS income_cents,
            COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END), 0) AS expense_cents,
            COALESCE(SUM(amount_cents), 0)                                      AS net_cents,
            COUNT(*)                                                            AS count
       FROM transactions
      WHERE deleted_at IS NULL AND ${notATransfer()} AND date BETWEEN ? AND ?`,
    [start, end],
  );
  return row ?? { income_cents: 0, expense_cents: 0, net_cents: 0, count: 0 };
}

export interface CategorySpend {
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  /** Positive cents spent this month. */
  spent_cents: number;
}

/**
 * Spending per category for a month, biggest first.
 *
 * Includes categories with no budget, which is how the Month screen can offer
 * to put a limit on whatever is quietly eating the month.
 */
export async function getCategorySpend(
  db: SQLiteDatabase,
  month: MonthKey,
): Promise<CategorySpend[]> {
  const { start, end } = monthBounds(month);
  return db.getAllAsync<CategorySpend>(
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
        AND t.date BETWEEN ? AND ?
      GROUP BY t.category_id
      ORDER BY spent_cents DESC`,
    [start, end],
  );
}

/** Distinct `YYYY-MM` keys that have at least one transaction, newest first. */
export async function listMonthsWithData(db: SQLiteDatabase): Promise<MonthKey[]> {
  const rows = await db.getAllAsync<{ month: string }>(
    `SELECT DISTINCT substr(date, 1, 7) AS month
       FROM transactions
      WHERE deleted_at IS NULL
      ORDER BY month DESC`,
  );
  return rows.map((row) => row.month);
}
