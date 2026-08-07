/**
 * What a backup file is, and what may come out of one.
 *
 * Separate from `lib/backup.ts` because that file talks to SQLite and therefore
 * cannot be loaded outside the app. Everything here is pure: the shape of the
 * format, the columns a restore may write, the rules that decide whether a file is
 * safe to act on, and the CSV escaping. Those are the parts worth checking, and this
 * is what makes them checkable.
 */

/** Bump when the shape changes in a way an older reader cannot handle. */
export const FORMAT_VERSION = 1;

/** Tables carried in a backup, in dependency order so a restore can replay them. */
export const TABLES = [
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

export type TableName = (typeof TABLES)[number];
export type Row = Record<string, string | number | null>;

export interface Backup {
  format: number;
  app: 'fare';
  exported_at: string;
  tables: Record<TableName, Row[]>;
}

const SYNCABLE = ['id', 'household_id', 'created_at', 'updated_at', 'deleted_at'] as const;

/**
 * Every column a restore is allowed to write, per table.
 *
 * A restore used to build its `INSERT` from `Object.keys(row)` — column names taken
 * straight out of the file and interpolated unquoted. A backup carrying a key like
 * `id) VALUES ('x'); DROP TABLE transactions; --` was arbitrary SQL. Column names
 * cannot be bound as parameters, so an allowlist is the only safe form.
 *
 * Written out rather than read from `PRAGMA table_info`, so a column added by a
 * future migration is a deliberate edit here rather than something a restore quietly
 * starts accepting.
 */
export const BACKUP_COLUMNS: Record<TableName, readonly string[]> = {
  categories: [...SYNCABLE, 'name', 'kind', 'color', 'icon', 'sort_order', 'archived'],
  accounts: [...SYNCABLE, 'name', 'kind', 'currency'],
  transactions: [
    ...SYNCABLE,
    'account_id',
    'category_id',
    'amount_cents',
    'date',
    'description',
    'notes',
    'source',
    'import_hash',
    'recurring_id',
    'transfer_group_id',
    'split_group_id',
    'receipt_file',
  ],
  budgets: [...SYNCABLE, 'category_id', 'month', 'limit_cents', 'rollover', 'rollover_since'],
  import_rules: [...SYNCABLE, 'pattern', 'match_type', 'category_id', 'priority'],
  import_presets: [
    ...SYNCABLE,
    'name',
    'header_signature',
    'date_column',
    'amount_column',
    'description_column',
    'date_format',
    'all_negative',
  ],
  saved_filters: [...SYNCABLE, 'name', 'search', 'direction', 'category_id', 'scope', 'sort_order'],
  recurring_rules: [
    ...SYNCABLE,
    'category_id',
    'amount_cents',
    'description',
    'notes',
    'frequency',
    'anchor_date',
    'last_applied_date',
  ],
  goals: [...SYNCABLE, 'name', 'target_cents', 'saved_cents', 'deadline', 'color', 'sort_order'],
  templates: [...SYNCABLE, 'label', 'amount_cents', 'category_id', 'description', 'sort_order'],
  // Device state, not ledger data: no id, no household, no soft delete.
  settings: ['key', 'value', 'updated_at'],
};

/** Columns that must hold whole numbers of cents if they are present at all. */
const CENTS_COLUMNS = new Set(['amount_cents', 'limit_cents', 'target_cents', 'saved_cents']);

export interface ValidationResult {
  ok: boolean;
  /** Why it was refused, in words a person can act on. */
  problem?: string;
}

/**
 * Decides whether a file can be restored, before anything is deleted.
 *
 * This runs first and on its own because a restore empties every table before it
 * writes. A file that is valid JSON and wrong in content would otherwise destroy the
 * ledger, with nothing to roll back to — the previous contents are exactly what the
 * restore just deleted.
 */
export function validateBackup(file: unknown): ValidationResult {
  if (typeof file !== 'object' || file === null) {
    return { ok: false, problem: 'That file is not a Fare backup.' };
  }

  const backup = file as Partial<Backup>;
  if (backup.app !== 'fare' || typeof backup.format !== 'number') {
    return { ok: false, problem: 'That file is not a Fare backup.' };
  }
  if (backup.format > FORMAT_VERSION) {
    return {
      ok: false,
      problem: 'That backup was made by a newer version of Fare. Update the app first.',
    };
  }
  if (typeof backup.tables !== 'object' || backup.tables === null || Array.isArray(backup.tables)) {
    return { ok: false, problem: 'That backup has no tables in it.' };
  }

  for (const table of TABLES) {
    const rows = (backup.tables as Record<string, unknown>)[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      return { ok: false, problem: `The ${table} section of that backup is not a list.` };
    }

    const allowed = new Set(BACKUP_COLUMNS[table]);
    const seenIds = new Set<string>();

    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        return { ok: false, problem: `A row in ${table} is not a record.` };
      }

      for (const [column, value] of Object.entries(row)) {
        if (!allowed.has(column)) {
          return { ok: false, problem: `A row in ${table} has an unknown field "${column}".` };
        }
        if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
          return { ok: false, problem: `The ${column} of a row in ${table} is not a value.` };
        }
        // Cents are integers everywhere in this app. A float here means the file was
        // written by something that does not know that, and storing it would put a
        // fractional cent in the ledger.
        if (CENTS_COLUMNS.has(column) && !(typeof value === 'number' && Number.isInteger(value))) {
          return {
            ok: false,
            problem: `The ${column} of a row in ${table} is not a whole number of cents.`,
          };
        }
      }

      if (table === 'settings') {
        if (typeof (row as Row).key !== 'string') {
          return { ok: false, problem: 'A settings row has no key.' };
        }
        continue;
      }

      const id = (row as Row).id;
      if (typeof id !== 'string' || id.length === 0) {
        return { ok: false, problem: `A row in ${table} has no id.` };
      }
      if (seenIds.has(id)) {
        return { ok: false, problem: `Two rows in ${table} share the id ${id}.` };
      }
      seenIds.add(id);
    }
  }

  return { ok: true };
}

/**
 * One CSV cell: RFC 4180 quoting, plus a guard against the spreadsheet running it.
 *
 * A cell beginning `=`, `+`, `-`, `@`, a tab or a carriage return is a live formula in
 * Excel, LibreOffice and Sheets. Descriptions here come out of bank CSVs, so the text
 * is whatever a merchant put in a payment reference — `=HYPERLINK("http://…"&A1)` in a
 * statement would otherwise travel through Fare into the user's spreadsheet and fire
 * when they opened it.
 *
 * A leading apostrophe is the conventional neutraliser: spreadsheets read the rest as
 * text, and an importer that strips one leading apostrophe round-trips losslessly.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (!/[",\n\r]/.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}
