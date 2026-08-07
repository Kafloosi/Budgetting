/**
 * Import dedupe. Guards F-03.
 *
 * Two properties in direct tension, and both must hold:
 *
 *   - two genuinely identical transactions in one statement are two transactions
 *   - the same statement imported twice adds nothing
 *
 * A change that satisfies one by breaking the other is not an improvement. The
 * digest itself is expo-crypto's and is substituted here; what is under test is the
 * string it is given, which is the decision about which rows are the same.
 */

import { createHash } from 'node:crypto';

import { check, report, section } from './lib/check.mjs';
import { importSource, openMigratedDb } from './lib/schema.mjs';

const { fingerprintInput, assignOrdinals, normaliseDescription } = await importSource(
  'src/lib/fingerprint.ts',
);

const digest = (date, cents, description, nth = 0) =>
  createHash('sha256').update(fingerprintInput(date, cents, description, nth)).digest('hex');

/** One statement: two identical coffees, and something else. */
const STATEMENT = [
  { date: '2026-03-04', amount_cents: -350, description: 'COFFEE SHOP' },
  { date: '2026-03-04', amount_cents: -350, description: 'COFFEE SHOP' },
  { date: '2026-03-04', amount_cents: -1200, description: 'BOOKSHOP' },
];

let unique = 0;
function runImport(db, rows) {
  let inserted = 0;
  for (const row of assignOrdinals(rows)) {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO transactions
           (id, household_id, account_id, category_id, amount_cents, date, description, notes,
            source, import_hash, recurring_id, transfer_group_id, split_group_id, receipt_file,
            created_at, updated_at, deleted_at)
         VALUES (?, NULL, 'seed-account-main', NULL, ?, ?, ?, NULL, 'import', ?, NULL, NULL, NULL,
                 NULL, 'n', 'n', NULL)`,
      )
      .run(
        `row-${unique++}`,
        row.amount_cents,
        row.date,
        row.description,
        digest(row.date, row.amount_cents, row.description, row.nth),
      );
    inserted += result.changes;
  }
  return { inserted, skipped: rows.length - inserted };
}

section('A statement with a genuine duplicate keeps both');
{
  const db = openMigratedDb();
  check('first import', runImport(db, STATEMENT), { inserted: 3, skipped: 0 });
  check(
    'spending totals the whole statement',
    db.prepare('SELECT SUM(-amount_cents) AS s FROM transactions WHERE deleted_at IS NULL').get().s,
    1900,
  );
}

section('The same statement imported again adds nothing');
{
  const db = openMigratedDb();
  runImport(db, STATEMENT);
  check('second import', runImport(db, STATEMENT), { inserted: 0, skipped: 3 });
  check('row count', db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 3);
}

section('An overlapping statement adds only what is new');
{
  const db = openMigratedDb();
  runImport(db, STATEMENT);
  const overlap = runImport(db, [
    ...STATEMENT,
    { date: '2026-03-05', amount_cents: -800, description: 'GREENGROCER' },
  ]);
  check('overlap', overlap, { inserted: 1, skipped: 3 });
}

section('Three of the same thing in one day are three');
{
  const db = openMigratedDb();
  const three = Array.from({ length: 3 }, () => STATEMENT[0]);
  check('first import', runImport(db, three), { inserted: 3, skipped: 0 });
  check('re-import', runImport(db, three), { inserted: 0, skipped: 3 });
}

section('Wording the bank changed between exports is not a difference');
check('padding and case are flattened', normaliseDescription('  ALBERT   Heijn '), 'albert heijn');
check(
  'so the fingerprint is unchanged',
  digest('2026-03-04', -350, 'COFFEE  shop'),
  digest('2026-03-04', -350, 'coffee shop'),
);

section('Rows already fingerprinted on a device still match');
// nth === 0 must produce the pre-ordinal string byte for byte, which is what makes
// the fix need no migration.
check(
  'the nth=0 string is the pre-fix one',
  fingerprintInput('2026-03-04', -350, 'COFFEE SHOP'),
  '2026-03-04|-350|coffee shop',
);
check(
  'and nth>0 differs from it',
  fingerprintInput('2026-03-04', -350, 'COFFEE SHOP', 1) !==
    fingerprintInput('2026-03-04', -350, 'COFFEE SHOP', 0),
  true,
);

section('Ordinals are per identical row, not per file position');
check(
  'assignOrdinals numbers each group separately',
  assignOrdinals(STATEMENT).map((row) => row.nth),
  [0, 1, 0],
);

report('fingerprint');
