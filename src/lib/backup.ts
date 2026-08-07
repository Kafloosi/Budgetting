import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso, withTransaction } from '@/db/util';

/**
 * Whole-ledger backup and restore.
 *
 * Local-first means the user owns the only copy, so moving to a new phone has
 * to be possible without an account. The file is plain JSON of every row — a
 * format the user can read, and one that survives this app being uninstalled.
 */

/** Bump when the shape changes in a way an older reader cannot handle. */
const FORMAT_VERSION = 1;

/** Tables carried in a backup, in dependency order so a restore can replay them. */
const TABLES = [
  'categories',
  'accounts',
  'transactions',
  'budgets',
  'import_rules',
  'import_presets',
  'saved_filters',
  'recurring_rules',
  'goals',
  'templates',
  'settings',
] as const;

type TableName = (typeof TABLES)[number];
type Row = Record<string, string | number | null>;

export interface Backup {
  format: number;
  app: 'fare';
  exported_at: string;
  tables: Record<TableName, Row[]>;
}

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
  if (backup?.app !== 'fare' || typeof backup.format !== 'number') {
    throw new Error('That file is not a Fare backup.');
  }
  if (backup.format > FORMAT_VERSION) {
    throw new Error('That backup was made by a newer version of Fare. Update the app first.');
  }

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

      const columns = Object.keys(rows[0]);
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
        quote(row.description),
        quote(row.category ?? ''),
        (row.amount_cents / 100).toFixed(2),
        quote(row.notes ?? ''),
        row.source,
      ].join(','),
    );
  }

  return lines.join('\n');
}

/** RFC 4180 quoting: wrap when it could confuse a reader, double inner quotes. */
function quote(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
