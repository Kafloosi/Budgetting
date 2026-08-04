import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 *
 * Rules for adding one:
 * - Append to the end of the array. Never edit or reorder a shipped migration —
 *   devices that already ran it will not run it again.
 * - Keep each migration self-contained. It runs inside a transaction.
 */
const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE categories (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    color        TEXT NOT NULL,
    icon         TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE accounts (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'checking',
    currency     TEXT NOT NULL DEFAULT 'EUR',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE transactions (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    date         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    notes        TEXT,
    source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    import_hash  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE budgets (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month        TEXT,
    limit_cents  INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE import_rules (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    pattern      TEXT NOT NULL,
    match_type   TEXT NOT NULL DEFAULT 'contains'
                 CHECK (match_type IN ('contains', 'starts_with', 'equals')),
    category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    priority     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  -- The list screen and every report filter on date, newest first.
  CREATE INDEX idx_transactions_date ON transactions(date DESC) WHERE deleted_at IS NULL;
  CREATE INDEX idx_transactions_category ON transactions(category_id) WHERE deleted_at IS NULL;

  -- Makes re-importing the same statement a no-op rather than a pile of
  -- duplicates. Partial, so manual rows (null hash) and deleted rows are exempt.
  CREATE UNIQUE INDEX idx_transactions_import_hash
    ON transactions(import_hash)
    WHERE import_hash IS NOT NULL AND deleted_at IS NULL;

  -- One limit per category per month. COALESCE collapses the "recurring"
  -- null month to a sentinel, because SQLite treats NULLs as distinct and
  -- would otherwise allow duplicate recurring limits.
  CREATE UNIQUE INDEX idx_budgets_category_month
    ON budgets(category_id, COALESCE(month, '*'))
    WHERE deleted_at IS NULL;
  `,
];

/** Categories a new install starts with, so the app is usable immediately. */
const SEED_CATEGORIES: { name: string; kind: 'expense' | 'income'; color: string; icon: string }[] = [
  { name: 'Groceries', kind: 'expense', color: '#4E79A7', icon: '🛒' },
  { name: 'Rent & Housing', kind: 'expense', color: '#F28E2B', icon: '🏠' },
  { name: 'Utilities', kind: 'expense', color: '#59A14F', icon: '💡' },
  { name: 'Transport', kind: 'expense', color: '#E15759', icon: '🚆' },
  { name: 'Dining Out', kind: 'expense', color: '#B07AA1', icon: '🍽️' },
  { name: 'Health', kind: 'expense', color: '#76B7B2', icon: '💊' },
  { name: 'Subscriptions', kind: 'expense', color: '#EDC948', icon: '📺' },
  { name: 'Shopping', kind: 'expense', color: '#FF9DA7', icon: '👕' },
  { name: 'Other', kind: 'expense', color: '#9C755F', icon: '📦' },
  { name: 'Salary', kind: 'income', color: '#2E7D32', icon: '💰' },
  { name: 'Other Income', kind: 'income', color: '#66BB6A', icon: '➕' },
];

/**
 * Brings the database up to the latest schema version.
 *
 * Passed to `<SQLiteProvider onInit={...}>`, so it runs once before any screen
 * touches the database.
 */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  // WAL keeps reads from blocking on writes, which matters once an import is
  // writing hundreds of rows while the list screen is still on screen.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= MIGRATIONS.length) return;

  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[version]);
      if (version === 0) await seedCategories(txn);
      // PRAGMA does not accept bound parameters, and `version` is a loop
      // counter over a local array, so interpolation is safe here.
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

async function seedCategories(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    await db.runAsync(
      `INSERT INTO categories
         (id, household_id, name, kind, color, icon, sort_order, archived, created_at, updated_at, deleted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
      [
        // Deterministic ids keep seeded categories identical across a future
        // multi-device sync, so two phones do not end up with two "Groceries".
        `seed-${category.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        category.name,
        category.kind,
        category.color,
        category.icon,
        index,
        now,
        now,
      ],
    );
  }
}
