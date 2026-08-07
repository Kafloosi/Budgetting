import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso, withTransaction } from '@/db/util';
import {
  BACKUP_COLUMNS,
  csvCell,
  FORMAT_VERSION,
  TABLES,
  validateBackup,
  type Backup,
  type Row,
  type TableName,
} from '@/lib/backup-format';

/**
 * Whole-ledger backup and restore.
 *
 * Local-first means the user owns the only copy, so moving to a new phone has
 * to be possible without an account. The file is plain JSON of every row — a
 * format the user can read, and one that survives this app being uninstalled.
 *
 * The format itself, the columns a restore may write, the validation and the CSV
 * escaping live in `lib/backup-format.ts`, which touches no database and can
 * therefore be checked directly. This file is the part that talks to SQLite.
 */

export { validateBackup, csvCell, BACKUP_COLUMNS } from '@/lib/backup-format';
export type { Backup } from '@/lib/backup-format';

export async function exportBackup(db: SQLiteDatabase): Promise<Backup> {
  const tables = {} as Record<TableName, Row[]>;
  for (const table of TABLES) {
    tables[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
  }
  return { format: FORMAT_VERSION, app: 'fare', exported_at: nowIso(), tables };
}

export interface RestoreResult {
  /** Rows written, per table. */
  counts: Partial<Record<TableName, number>>;
  total: number;
}

/**
 * Replaces the ledger with a backup's contents.
 *
 * Destructive by design: a restore is "make this phone look like that one", not
 * a merge. Two devices' ledgers cannot be merged without the conflict
 * resolution that `updated_at` exists for and that does not exist yet, and
 * silently interleaving them would produce a ledger nobody could trust.
 */
export async function restoreBackup(db: SQLiteDatabase, backup: Backup): Promise<RestoreResult> {
  // Validated in full before a single row is deleted. Everything below this line is
  // destructive and has nothing to roll back to.
  const validation = validateBackup(backup);
  if (!validation.ok) throw new Error(validation.problem);

  const counts: Partial<Record<TableName, number>> = {};
  let total = 0;

  await withTransaction(db, async (txn) => {
    // Reverse order on the way out, so rows never outlive what they reference.
    for (const table of [...TABLES].reverse()) {
      await txn.execAsync(`DELETE FROM ${table}`);
    }

    for (const table of TABLES) {
      const rows = backup.tables?.[table] ?? [];
      if (rows.length === 0) continue;

      // Intersected with the allowlist rather than taken from the file, so a column
      // name can never reach the statement. Validation has already refused anything
      // unknown; this is the belt to that braces.
      const columns = BACKUP_COLUMNS[table].filter((column) =>
        rows.some((row) => row[column] !== undefined),
      );
      if (columns.length === 0) continue;

      const placeholders = columns.map(() => '?').join(', ');
      const statement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of rows) {
        await txn.runAsync(
          statement,
          columns.map((column) => row[column] ?? null),
        );
      }
      counts[table] = rows.length;
      total += rows.length;
    }
  });

  return { counts, total };
}

/**
 * Every transaction as CSV, for a spreadsheet.
 *
 * Amounts are written as signed decimals rather than cents, because that is
 * what a spreadsheet will sum correctly without the user knowing anything about
 * how this app stores money.
 */
export async function exportCsv(db: SQLiteDatabase): Promise<string> {
  const rows = await db.getAllAsync<{
    date: string;
    description: string;
    category: string | null;
    amount_cents: number;
    notes: string | null;
    source: string;
  }>(
    `SELECT t.date, t.description, c.name AS category, t.amount_cents, t.notes, t.source
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.date DESC, t.created_at DESC`,
  );

  const header = ['Date', 'Description', 'Category', 'Amount', 'Notes', 'Source'];
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.date,
        csvCell(row.description),
        csvCell(row.category ?? ''),
        (row.amount_cents / 100).toFixed(2),
        csvCell(row.notes ?? ''),
        row.source,
      ].join(','),
    );
  }

  return lines.join('\n');
}
