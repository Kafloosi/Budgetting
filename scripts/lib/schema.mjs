/**
 * Shared plumbing for the check scripts.
 *
 * Reads `MIGRATIONS` out of the TypeScript source and replays it into an in-memory
 * SQLite database, so a check can assert against the real schema without a device,
 * a test runner or a dependency.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The migration SQL, in order.
 *
 * Regex rather than a parser, to stay dependency-free. JS line comments are dropped
 * first because the comments in `migrations.ts` contain backticks (`recurring_id`)
 * which would otherwise be read as string delimiters and split a migration in half —
 * a bug that once made an ad-hoc version of this report two phantom failures. SQL in
 * that file uses `--` comments, which are left alone.
 */
export function loadMigrations() {
  const source = readFileSync(join(ROOT, 'src/db/migrations.ts'), 'utf8');
  const start = source.indexOf('const MIGRATIONS: string[] = [');
  if (start === -1) throw new Error('Could not find the MIGRATIONS array in src/db/migrations.ts.');
  const end = source.indexOf('\n];', start);

  const body = source
    .slice(start, end)
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

  const migrations = [...body.matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);
  if (migrations.length === 0) throw new Error('Found the MIGRATIONS array but no migrations.');
  return migrations;
}

/**
 * A database with the schema applied.
 *
 * `upTo` stops early, which is how a check reproduces the state an existing install
 * is in before the migration under test runs.
 */
export function openMigratedDb({ upTo } = {}) {
  const migrations = loadMigrations();
  const applied = upTo === undefined ? migrations : migrations.slice(0, upTo);

  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  applied.forEach((sql) => db.exec(sql));
  db.exec(`PRAGMA user_version = ${applied.length}`);
  return db;
}

let aliasRegistered = false;

/**
 * Imports a TypeScript module from `src/`, relying on Node's type stripping.
 *
 * The `@/` alias hook is registered on first use rather than at load, so a check that
 * only needs the schema does not pay for it.
 */
export async function importSource(relative) {
  if (!aliasRegistered) {
    const { register } = await import('node:module');
    register('./alias-hook.mjs', import.meta.url);
    aliasRegistered = true;
  }
  const { pathToFileURL } = await import('node:url');
  return import(pathToFileURL(join(ROOT, relative)).href);
}
