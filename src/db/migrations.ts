import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from './util';

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

  // 2 — device settings
  //
  // Deliberately not a SyncableRecord. These are this device's preferences
  // (which currency to read the ledger in, whether first run is done), not
  // ledger data, so they carry no id, no household and no soft delete.
  `
  CREATE TABLE settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,

  // 3 — route palette
  //
  // Categories are routes on a rail diagram, so every seeded category moves
  // onto one of the six line colours. Only the fixed seed ids are touched;
  // anything the user made or recoloured keeps its own colour.
  `
  UPDATE categories SET color = '#009B4D' WHERE id = 'seed-groceries';
  UPDATE categories SET color = '#0057FF' WHERE id = 'seed-rent-housing';
  UPDATE categories SET color = '#FFB800' WHERE id = 'seed-utilities';
  UPDATE categories SET color = '#E7002A' WHERE id = 'seed-transport';
  UPDATE categories SET color = '#8E4EC6' WHERE id = 'seed-dining-out';
  UPDATE categories SET color = '#00A3A3' WHERE id = 'seed-health';
  UPDATE categories SET color = '#0057FF' WHERE id = 'seed-subscriptions';
  UPDATE categories SET color = '#FFB800' WHERE id = 'seed-shopping';
  UPDATE categories SET color = '#8E4EC6' WHERE id = 'seed-other';
  UPDATE categories SET color = '#009B4D' WHERE id = 'seed-salary';
  UPDATE categories SET color = '#00A3A3' WHERE id = 'seed-other-income';
  `,

  // 4 — scheduled services, goals and quick entries
  //
  // A recurring rule is a timetabled service: it does not store its own
  // occurrences, it remembers the last date it ran so catch-up can materialise
  // whatever became due while the app was closed. Transactions it creates carry
  // `recurring_id`, so deleting a rule can leave its history alone.
  `
  CREATE TABLE recurring_rules (
    id                TEXT PRIMARY KEY NOT NULL,
    household_id      TEXT,
    category_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
    amount_cents      INTEGER NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    notes             TEXT,
    frequency         TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
    anchor_date       TEXT NOT NULL,
    last_applied_date TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT
  );

  CREATE TABLE goals (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    name         TEXT NOT NULL,
    target_cents INTEGER NOT NULL,
    saved_cents  INTEGER NOT NULL DEFAULT 0,
    deadline     TEXT,
    color        TEXT NOT NULL DEFAULT '#0057FF',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE templates (
    id           TEXT PRIMARY KEY NOT NULL,
    household_id TEXT,
    label        TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
    description  TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  ALTER TABLE transactions ADD COLUMN recurring_id TEXT;

  -- The trash screen reads deleted rows newest first; every other query in the
  -- app filters them out, so they need an index of their own.
  CREATE INDEX idx_transactions_deleted ON transactions(deleted_at DESC)
    WHERE deleted_at IS NOT NULL;
  `,

  // 5 — clear the seeded emoji
  //
  // A shipped default that fills every roundel on the Month screen with
  // multi-colour emoji fights the six-colour route palette it sits inside. The
  // roundel falls back to the line's letter instead, which is how a network
  // names its lines. The column stays, and an emoji the user picks themselves
  // is still their content and still shown.
  `
  UPDATE categories SET icon = ''
   WHERE id LIKE 'seed-%' AND deleted_at IS NULL;
  `,

  // 6 — remembered statement formats
  //
  // A bank's export keeps the same columns every month, so saying which column is
  // which should be a thing you do once per bank rather than once per file.
  //
  // `header_signature` is the flattened heading row. When a picked file's headings
  // match a saved one, the mapping is applied without asking — which is the whole
  // point, and why the signature is stored rather than recomputed from the column
  // indices. It is nullable so a preset saved from a file with no usable headings
  // can still be chosen by hand.
  `
  CREATE TABLE import_presets (
    id                 TEXT PRIMARY KEY NOT NULL,
    household_id       TEXT,
    name               TEXT NOT NULL,
    header_signature   TEXT,
    date_column        INTEGER NOT NULL,
    amount_column      INTEGER NOT NULL,
    description_column INTEGER NOT NULL,
    date_format        TEXT NOT NULL
                       CHECK (date_format IN ('iso', 'dmy', 'mdy', 'compact')),
    all_negative       INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    deleted_at         TEXT
  );

  -- One preset per name, so re-saving "ING" updates rather than accumulating.
  CREATE UNIQUE INDEX idx_import_presets_name
    ON import_presets(name COLLATE NOCASE)
    WHERE deleted_at IS NULL;

  -- Looked up on every file pick.
  CREATE INDEX idx_import_presets_signature
    ON import_presets(header_signature)
    WHERE deleted_at IS NULL AND header_signature IS NOT NULL;
  `,

  // 7 — carrying a limit over
  //
  // Underspending a limit and losing the difference at midnight on the 1st is the
  // thing envelope budgeters expect not to happen. The flag lives on every budget
  // row for a category rather than on one of them, because carrying over is a
  // property of the category's limit and not of a particular month — and picking
  // one row to hold it would mean deciding what happens when that row is the one
  // deleted.
  //
  // The carried balance itself is never stored. It is computed from the months
  // behind it, because a stored balance is a second source of truth that goes
  // wrong the moment a past transaction is edited.
  //
  // `rollover_since` is the month carrying-over was switched on, and it is what
  // stops the feature handing out money nobody banked: without it, turning
  // rollover on for a category with a standing limit and a quiet year would
  // credit a full limit for every one of those quiet months at once.
  `
  ALTER TABLE budgets ADD COLUMN rollover INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE budgets ADD COLUMN rollover_since TEXT;
  `,

  // 8 — accounts, finally pointed at something
  //
  // The table has existed since migration 1 and `account_id` was plumbed through
  // every insert, yet nothing ever wrote a non-null value: every transaction in
  // every ledger belonged to the same invisible account. Surfacing accounts means
  // the existing ledger has to land somewhere, so one is seeded and everything is
  // backfilled onto it.
  //
  // The id is fixed rather than generated, matching the `seed-` convention the
  // categories use, so two devices under a future sync cannot invent two
  // different "Main" accounts and then have to reconcile them.
  `
  -- strftime rather than datetime(), so these timestamps match the ISO-8601 that
  -- nowIso() writes everywhere else. Mixed formats in one column sort wrongly.
  INSERT INTO accounts
    (id, household_id, name, kind, currency, created_at, updated_at, deleted_at)
  SELECT 'seed-account-main', NULL, 'Main', 'checking',
         COALESCE((SELECT value FROM settings WHERE key = 'currency'), 'EUR'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         NULL
   WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = 'seed-account-main');

  -- Trashed rows included on purpose. Trash is recoverable for 30 days, and a
  -- row restored without an account would be the one state the rest of the app
  -- now assumes cannot happen.
  UPDATE transactions
     SET account_id = 'seed-account-main'
   WHERE account_id IS NULL;

  -- Balances and the ledger's account filter both read this.
  CREATE INDEX idx_transactions_account ON transactions(account_id)
    WHERE deleted_at IS NULL;
  `,

  // 9 — transfers between your own accounts
  //
  // A transfer is two sibling rows sharing a group id: negative in the account the
  // money left, positive in the one it arrived in, neither carrying a category.
  // There is no parent row on purpose — the pair sums to zero, so a plain
  // SUM(amount_cents) over the whole ledger stays true, and each account's balance
  // moves by exactly the right amount.
  //
  // The cost is that every spend and income aggregate must now exclude them, or
  // moving your own money reads as income and inflates every forecast. That guard
  // is in the repositories; this column is only what makes it possible.
  `
  ALTER TABLE transactions ADD COLUMN transfer_group_id TEXT;

  CREATE INDEX idx_transactions_transfer ON transactions(transfer_group_id)
    WHERE transfer_group_id IS NOT NULL AND deleted_at IS NULL;
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
    await withTransaction(db, async (txn) => {
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
