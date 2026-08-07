/**
 * The import pipeline, minus its native parts.
 *
 * `buildImportInputs` is where a statement stops being rows of text and becomes
 * rows of ledger. The digest and the UUIDs are substituted here, as they are in
 * check-fingerprint, because what is under test is the decision — which rows are
 * kept, which are refused, what each one is fingerprinted on — and not the crypto.
 */

import { createHash } from 'node:crypto';

import { check, report, section } from './lib/check.mjs';
import { importSource, openMigratedDb } from './lib/schema.mjs';

const { buildImportInputs } = await importSource('src/lib/import-run.ts');

const hash = async (date, cents, description, nth) =>
  createHash('sha256')
    .update(nth === 0 ? `${date}|${cents}|${description.trim().toLowerCase()}` : `${date}|${cents}|${description.trim().toLowerCase()}|${nth}`)
    .digest('hex');

const never = () => null;
const groceries = (description) => (/albert/i.test(description) ? 'cat-groceries' : null);

const MAPPING = { date: 0, amount: 1, description: 2, format: 'dmy', allNegative: false };

section('A clean statement becomes inputs');
{
  const rows = [
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
    ['04-03-2026', '-12,00', 'BOOKSHOP'],
  ];
  const built = await buildImportInputs(rows, MAPPING, never, hash);
  check('every row kept', built.inputs.length, 2);
  check('none refused', built.invalid, 0);
  check('cents are signed and whole', built.inputs[0].amount_cents, -350);
  check('date is normalised', built.inputs[0].date, '2026-03-04');
  check('source is import', built.inputs[0].source, 'import');
}

section('Two identical rows in one file stay two transactions');
{
  const rows = [
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
  ];
  const built = await buildImportInputs(rows, MAPPING, never, hash);
  check('both kept', built.inputs.length, 2);
  check(
    'and they fingerprint differently',
    built.inputs[0].import_hash !== built.inputs[1].import_hash,
    true,
  );
}

section('The same file built twice produces the same fingerprints');
{
  const rows = [
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
  ];
  const first = await buildImportInputs(rows, MAPPING, never, hash);
  const second = await buildImportInputs(rows, MAPPING, never, hash);
  check(
    'so a re-import collides with itself',
    first.inputs.map((row) => row.import_hash).join(),
    second.inputs.map((row) => row.import_hash).join(),
  );
}

section('Unreadable rows are refused, not guessed at');
{
  const rows = [
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
    ['not a date', 'not an amount', 'RUBBISH'],
    ['', '', ''],
  ];
  const built = await buildImportInputs(rows, MAPPING, never, hash);
  check('the good row survives', built.inputs.length, 1);
  check('the rest are counted', built.invalid, 2);
}

section('The rule matcher fills the category');
{
  const rows = [
    ['04-03-2026', '-8,20', 'ALBERT HEIJN 1234'],
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
  ];
  const built = await buildImportInputs(rows, MAPPING, groceries, hash);
  check('matched row is categorised', built.inputs[0].category_id, 'cat-groceries');
  check('unmatched row is left empty', built.inputs[1].category_id, null);
}

section('A trailing minus is still a debit');
{
  const rows = [['04-03-2026', '12,34-', 'DUTCH EXPORT']];
  const built = await buildImportInputs(rows, MAPPING, never, hash);
  check('filed as spending', built.inputs[0].amount_cents, -1234);
}

section('The built hashes deduplicate against the real schema');
{
  const db = openMigratedDb();
  const rows = [
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
    ['04-03-2026', '-3,50', 'COFFEE SHOP'],
    ['04-03-2026', '-12,00', 'BOOKSHOP'],
  ];
  const built = await buildImportInputs(rows, MAPPING, never, hash);

  let seq = 0;
  const insert = () => {
    let inserted = 0;
    for (const row of built.inputs) {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO transactions
             (id, household_id, account_id, category_id, amount_cents, date, description, notes,
              source, import_hash, created_at, updated_at, deleted_at)
           VALUES (?, NULL, 'seed-account-main', NULL, ?, ?, ?, NULL, 'import', ?, 'n', 'n', NULL)`,
        )
        .run(`row-${seq++}`, row.amount_cents, row.date, row.description, row.import_hash);
      inserted += result.changes;
    }
    return inserted;
  };

  check('first import lands everything', insert(), 3);
  check('second import lands nothing', insert(), 0);
  check(
    'and spending totals the statement once',
    db.prepare('SELECT SUM(-amount_cents) AS s FROM transactions WHERE deleted_at IS NULL').get().s,
    1900,
  );
}

report('import-run');
