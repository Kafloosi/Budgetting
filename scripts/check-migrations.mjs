/**
 * Checks the schema before it reaches a phone.
 *
 * `MIGRATIONS` is append-only for a reason that has no undo: a device that has
 * already run migration 4 will never run it again, so editing one ships two
 * different schemas under the same `user_version`. Nothing in the repo caught
 * that — `typecheck` does not read SQL strings and `lint` does not run them.
 *
 * This does three things:
 *
 *   1. Replays every migration, in order, against a real SQLite database.
 *   2. Checks each ledger table carries the syncable columns.
 *   3. Fingerprints the shipped migrations and refuses a change to one.
 *
 * Usage:
 *   node scripts/check-migrations.mjs             verify
 *   node scripts/check-migrations.mjs --update    record newly appended ones
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCE = join(ROOT, 'src/db/migrations.ts');
const LOCK = join(HERE, 'migrations.lock.json');

const update = process.argv.includes('--update');

/**
 * Tables that are this device's own state rather than ledger rows, and so carry
 * no id, household or soft delete. Kept in step with the comment in
 * `migrations.ts`.
 */
const NOT_SYNCABLE = new Set(['settings']);
const SYNCABLE_COLUMNS = ['id', 'household_id', 'created_at', 'updated_at', 'deleted_at'];

const problems = [];
const fail = (message) => problems.push(message);

// ── Read the migrations ──────────────────────────────────────────────────────
//
// Regex rather than a parser, so this stays dependency-free. Line comments are
// dropped first because they contain backticks (`recurring_id`) that would
// otherwise be read as string delimiters and split a migration in half. SQL in
// this file uses `--` comments, which are left alone.

const source = readFileSync(SOURCE, 'utf8');
const start = source.indexOf('const MIGRATIONS: string[] = [');
if (start === -1) {
  console.error('Could not find the MIGRATIONS array in src/db/migrations.ts.');
  process.exit(1);
}
const end = source.indexOf('\n];', start);
const body = source
  .slice(start, end)
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const migrations = [...body.matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);

if (migrations.length === 0) {
  console.error('Found the MIGRATIONS array but no migrations in it.');
  process.exit(1);
}

console.log(`${migrations.length} migrations`);

// ── Append-only guard ────────────────────────────────────────────────────────

const fingerprint = (sql) => createHash('sha256').update(sql.trim()).digest('hex').slice(0, 16);
const current = migrations.map(fingerprint);
const recorded = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null;

if (!recorded) {
  writeFileSync(LOCK, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  console.log(`Recorded ${current.length} fingerprints in scripts/migrations.lock.json.`);
} else {
  if (current.length < recorded.length) {
    fail(
      `${recorded.length - current.length} migration(s) were removed. Shipped migrations cannot be taken back — a device that ran them will not un-run them.`,
    );
  }

  recorded.forEach((hash, index) => {
    if (current[index] && current[index] !== hash) {
      fail(
        `Migration ${index + 1} has been edited. It has shipped, so devices that already ran it will never run it again — add a new migration at the end instead.`,
      );
    }
  });

  const appended = current.length - recorded.length;
  if (appended > 0) {
    if (update) {
      writeFileSync(LOCK, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
      console.log(`Recorded ${appended} newly appended migration(s).`);
    } else {
      console.log(
        `${appended} migration(s) appended and not yet recorded. Run with --update once you are happy with them.`,
      );
    }
  }
}

// ── Replay ───────────────────────────────────────────────────────────────────

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');

migrations.forEach((sql, index) => {
  try {
    db.exec(sql);
    db.exec(`PRAGMA user_version = ${index + 1}`);
  } catch (error) {
    fail(`Migration ${index + 1} does not run: ${error.message}`);
  }
});

const { user_version: version } = db.prepare('PRAGMA user_version').get();
if (version !== migrations.length) {
  fail(`user_version ended at ${version}, expected ${migrations.length}.`);
}

// ── Conventions ──────────────────────────────────────────────────────────────

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => row.name);

for (const table of tables) {
  if (NOT_SYNCABLE.has(table)) continue;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  const missing = SYNCABLE_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    fail(`Table "${table}" is missing ${missing.join(', ')}. Every ledger table carries the syncable columns.`);
  }
}

// A soft-deleted row must not be held to a uniqueness rule meant for live rows,
// or deleting something makes its name permanently unusable.
const partialIndexes = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")
  .all();

for (const index of partialIndexes) {
  if (/UNIQUE/i.test(index.sql) && !/deleted_at/i.test(index.sql)) {
    fail(
      `Unique index "${index.name}" does not exclude soft-deleted rows. Deleting a row would keep its value reserved forever.`,
    );
  }
}

console.log(`tables: ${tables.join(', ')}`);
console.log(`user_version: ${version}`);

// ── Verdict ──────────────────────────────────────────────────────────────────

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('\nSchema is sound.');
