/**
 * Backup and export. Guards F-04, F-05 and F-06.
 *
 * The restore path is the most dangerous code in the app: it deletes every row before
 * writing, so a file that is valid JSON and wrong in content destroys the ledger, and
 * there is no undo because the thing you would undo to was just overwritten.
 *
 * The export path is the app handing third-party text to a spreadsheet, and merchant
 * descriptions come out of bank CSVs.
 */

import { check, report, section } from './lib/check.mjs';
import { importSource } from './lib/schema.mjs';

// backup-format.ts rather than backup.ts: the latter reaches SQLite through
// @/db/util, which pulls expo-crypto and cannot load outside the app. The rules are
// in the format file precisely so they can be checked.
const { csvCell, BACKUP_COLUMNS, isSafeReceiptName, validateBackup } = await importSource(
  'src/lib/backup-format.ts',
);

section('A merchant name cannot become a spreadsheet formula (F-06)');
for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1+1', '\r=1+1', '=HYPERLINK("http://x")']) {
  const cell = csvCell(dangerous);
  check(
    `${JSON.stringify(dangerous)} is neutralised`,
    // Either quoted-and-prefixed or bare-and-prefixed, but the first character the
    // spreadsheet parses must not be one that starts a formula.
    /^"?'/.test(cell),
    true,
  );
}

section('...without mangling ordinary text');
check('plain', csvCell('Albert Heijn'), 'Albert Heijn');
check('a comma is quoted', csvCell('Heijn, Albert'), '"Heijn, Albert"');
check('a quote is doubled', csvCell('12" pizza'), '"12"" pizza"');
check('a newline is quoted', csvCell('one\ntwo'), '"one\ntwo"');
check('a lone minus sign is still text', csvCell('-'), "'-");
check('a negative number is not text we are exporting', csvCell(''), '');

section('Only known columns are ever written back (F-04)');
check('every table has an allowlist', Object.keys(BACKUP_COLUMNS).length > 0, true);
check(
  'transactions allowlist covers the real columns',
  BACKUP_COLUMNS.transactions.includes('amount_cents') &&
    BACKUP_COLUMNS.transactions.includes('transfer_group_id') &&
    BACKUP_COLUMNS.transactions.includes('receipt_file'),
  true,
);
check(
  'and nothing else gets through',
  BACKUP_COLUMNS.transactions.includes("id) VALUES ('x'); DROP TABLE transactions; --"),
  false,
);

section('A malformed backup is refused before anything is deleted (F-05)');
const refuses = (label, file) => {
  const result = validateBackup(file);
  check(label, result.ok, false);
};

refuses('not a Fare backup', { app: 'something-else', format: 1, tables: {} });
refuses('no format', { app: 'fare', tables: {} });
refuses('a newer format', { app: 'fare', format: 99, tables: {} });
refuses('null', null);
refuses('a string', 'nope');
refuses('no tables', { app: 'fare', format: 1 });
refuses('tables is an array', { app: 'fare', format: 1, tables: [] });
refuses('a table is not an array', { app: 'fare', format: 1, tables: { categories: {} } });
refuses('a row is not an object', { app: 'fare', format: 1, tables: { categories: ['x'] } });
refuses('a row has no id', {
  app: 'fare',
  format: 1,
  tables: { categories: [{ name: 'x' }] },
});
refuses('an amount is a string', {
  app: 'fare',
  format: 1,
  tables: { transactions: [{ id: 'a', amount_cents: '12.50' }] },
});
refuses('an amount is a float', {
  app: 'fare',
  format: 1,
  tables: { transactions: [{ id: 'a', amount_cents: 12.5 }] },
});
refuses('a duplicate id inside one table', {
  app: 'fare',
  format: 1,
  tables: { categories: [{ id: 'a' }, { id: 'a' }] },
});
refuses('an injected column name', {
  app: 'fare',
  format: 1,
  tables: { categories: [{ id: 'a', "x) VALUES ('y'); DROP TABLE categories; --": 1 }] },
});

section('A good backup is accepted');
const good = {
  app: 'fare',
  format: 1,
  exported_at: '2026-08-07T00:00:00.000Z',
  tables: {
    categories: [{ id: 'c1', name: 'Groceries', kind: 'expense' }],
    transactions: [{ id: 't1', amount_cents: -1250, date: '2026-08-01' }],
  },
};
check('validateBackup accepts it', validateBackup(good).ok, true);
check('an empty but well-formed backup is fine', validateBackup({ app: 'fare', format: 1, tables: {} }).ok, true);
check(
  'settings rows have no id and must still be accepted',
  validateBackup({ app: 'fare', format: 1, tables: { settings: [{ key: 'currency', value: 'EUR' }] } }).ok,
  true,
);

section('A receipt name from a backup cannot escape the receipts folder');
// The name is joined onto a directory path at restore time, so this is the same
// class of defect as F-04: content from the file reaching somewhere it is treated
// as structure rather than data.
for (const hostile of [
  '../../databases/budget.db',
  '..',
  '../secrets.txt',
  '/etc/passwd',
  'a/b.jpg',
  'a\\b.jpg',
  '.hidden',
  '',
  'a'.repeat(200),
  null,
  42,
]) {
  check(`${JSON.stringify(hostile)} is refused`, isSafeReceiptName(hostile), false);
}
check('a name Fare writes is accepted', isSafeReceiptName('0f8d2c1a-4b7e.jpg'), true);

section('...and the whole receipts section is validated before a row is deleted');
const withReceipts = (receipts) => validateBackup({ app: 'fare', format: 1, tables: {}, receipts });

check('no receipts section at all is fine', validateBackup({ app: 'fare', format: 1, tables: {} }).ok, true);
check('an empty list is fine', withReceipts([]).ok, true);
check('a good receipt is accepted', withReceipts([{ name: 'a1.jpg', base64: 'AAAA' }]).ok, true);
check('a receipts section that is not a list', withReceipts({}).ok, false);
check('a receipt that is not a record', withReceipts(['a.jpg']).ok, false);
check('a traversing name', withReceipts([{ name: '../x.jpg', base64: 'AAAA' }]).ok, false);
check('a receipt with no image data', withReceipts([{ name: 'a1.jpg' }]).ok, false);
check(
  'a receipt with an unknown field',
  withReceipts([{ name: 'a1.jpg', base64: 'AAAA', uri: 'file:///x' }]).ok,
  false,
);
check(
  'two receipts with the same name',
  withReceipts([
    { name: 'a1.jpg', base64: 'AAAA' },
    { name: 'a1.jpg', base64: 'BBBB' },
  ]).ok,
  false,
);

report('backup');
