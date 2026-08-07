/**
 * The ledger's arithmetic, against a real database.
 *
 * Four rules that are cheap to break and expensive to notice:
 *
 *   - a transfer between your own accounts is neither spending nor income
 *   - a split adds up to what was paid, and does not break import dedupe
 *   - a carried-over budget counts only from the month it was switched on
 *   - the accounts backfill leaves no live row without an account
 *
 * The aggregate SQL is restated here rather than imported, because the repositories
 * need expo-sqlite. Each query is a copy of the real one including its guard, so a
 * guard removed in the repository will not fail this file — what it does catch is a
 * change in behaviour, and it documents exactly which queries carry the guard.
 */

import { check, report, section } from './lib/check.mjs';
import { openMigratedDb } from './lib/schema.mjs';

const NOT_A_TRANSFER = 'transfer_group_id IS NULL';

function seed(db) {
  db.exec(`INSERT INTO categories
    (id, household_id, name, kind, color, icon, sort_order, archived, created_at, updated_at, deleted_at)
    VALUES ('c1', NULL, 'Groceries', 'expense', '#009B4D', '', 0, 0, 'n', 'n', NULL),
           ('c2', NULL, 'Household', 'expense', '#0057FF', '', 1, 0, 'n', 'n', NULL)`);
  db.exec(`INSERT INTO accounts
    (id, household_id, name, kind, currency, created_at, updated_at, deleted_at)
    VALUES ('savings', NULL, 'Savings', 'savings', 'EUR', 'n', 'n', NULL)`);
}

let seq = 0;
function row(db, { amount, date = '2026-08-10', category = 'c1', account = 'seed-account-main', transfer = null, split = null, hash = null, deleted = null }) {
  db.prepare(
    `INSERT INTO transactions
       (id, household_id, account_id, category_id, amount_cents, date, description, notes, source,
        import_hash, recurring_id, transfer_group_id, split_group_id, receipt_file,
        created_at, updated_at, deleted_at)
     VALUES (?, NULL, ?, ?, ?, ?, 'x', NULL, 'manual', ?, NULL, ?, ?, NULL, 'n', 'n', ?)`,
  ).run(`t${seq++}`, account, category, amount, date, hash, transfer, split, deleted);
}

// ── Transfers ────────────────────────────────────────────────────────────────

section('A transfer is neither spending nor income');
{
  const db = openMigratedDb();
  seed(db);
  row(db, { amount: -12000 });
  row(db, { amount: 30000 });

  const aggregates = {
    'month totals': `SELECT COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END),0) AS income,
                            COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END),0) AS expense,
                            COALESCE(SUM(amount_cents),0) AS net
                       FROM transactions WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER}
                        AND date BETWEEN '2026-08-01' AND '2026-08-31'`,
    'category spend': `SELECT category_id, SUM(-amount_cents) AS spent FROM transactions
                        WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER} AND amount_cents < 0
                          AND date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY category_id`,
    'month bars': `SELECT substr(date,1,7) AS month,
                          COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END),0) AS income,
                          COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END),0) AS expense
                     FROM transactions WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER}
                    GROUP BY month`,
    'year totals': `SELECT COALESCE(SUM(amount_cents),0) AS net FROM transactions
                     WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER} AND substr(date,1,4) = '2026'`,
    'budget spend': `SELECT category_id, SUM(-amount_cents) AS spent FROM transactions
                      WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER} AND amount_cents < 0
                        AND date BETWEEN '2026-08-01' AND '2026-08-31' GROUP BY category_id`,
  };

  const snapshot = () =>
    Object.fromEntries(
      Object.entries(aggregates).map(([name, sql]) => [name, JSON.stringify(db.prepare(sql).all())]),
    );

  const before = snapshot();

  // €200 out of Main and into Savings.
  row(db, { amount: -20000, category: null, transfer: 'g1' });
  row(db, { amount: 20000, category: null, transfer: 'g1', account: 'savings' });

  const after = snapshot();
  for (const name of Object.keys(aggregates)) {
    check(`${name} is untouched`, after[name], before[name]);
  }

  check(
    'balances move, which is the point',
    db
      .prepare(
        `SELECT a.id, COALESCE(SUM(t.amount_cents),0) AS balance FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL
         GROUP BY a.id ORDER BY a.id`,
      )
      .all(),
    [
      { id: 'savings', balance: 20000 },
      { id: 'seed-account-main', balance: -2000 },
    ],
  );

  check(
    'the pair cancels, so the whole-ledger net is unchanged',
    db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE deleted_at IS NULL').get().n,
    18000,
  );

  check(
    'and without the guard income would be wrong — the guard earns its place',
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END),0) AS income
           FROM transactions WHERE deleted_at IS NULL AND date BETWEEN '2026-08-01' AND '2026-08-31'`,
      )
      .get().income,
    50000,
  );
}

// ── Splits ───────────────────────────────────────────────────────────────────

section('A split adds up to what was paid');
{
  const db = openMigratedDb();
  seed(db);
  row(db, { amount: -8000, hash: 'hash-abc' });

  const spend = () =>
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END),0) AS spent
           FROM transactions WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER}`,
      )
      .get().spent;

  check('before', spend(), 8000);

  db.exec("UPDATE transactions SET deleted_at = 'n' WHERE import_hash = 'hash-abc'");
  row(db, { amount: -5500, category: 'c1', split: 'g1', hash: 'hash-abc' });
  row(db, { amount: -2500, category: 'c2', split: 'g1' });

  check('after — identical', spend(), 8000);
  check(
    'and now shows on both lines',
    db
      .prepare(
        `SELECT category_id, SUM(-amount_cents) AS spent FROM transactions
          WHERE deleted_at IS NULL AND amount_cents < 0 GROUP BY category_id ORDER BY category_id`,
      )
      .all(),
    [
      { category_id: 'c1', spent: 5500 },
      { category_id: 'c2', spent: 2500 },
    ],
  );

  // Exactly one part may carry the original hash: none and the statement
  // re-imports as a duplicate, two and they collide with each other.
  let reimportRejected = false;
  try {
    row(db, { amount: -8000, hash: 'hash-abc' });
  } catch {
    reimportRejected = true;
  }
  check('re-importing the split row is still a no-op', reimportRejected, true);
}

// ── Rollover ─────────────────────────────────────────────────────────────────

section('A carried budget counts only from the month it was switched on');
{
  const db = openMigratedDb();
  seed(db);
  db.exec(`INSERT INTO budgets
    (id, household_id, category_id, month, limit_cents, rollover, rollover_since, created_at, updated_at, deleted_at)
    VALUES ('b1', NULL, 'c1', NULL, 20000, 1, '2026-01', 'n', 'n', NULL)`);

  row(db, { amount: -15000, date: '2026-01-10' }); // 5000 under
  row(db, { amount: -25000, date: '2026-02-10' }); // 5000 over
  row(db, { amount: -10000, date: '2026-03-10' }); // 10000 under
  row(db, { amount: -9999, date: '2026-05-10' }); // current month, not counted

  const WINDOW = 12;
  const shift = (month, delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
  };

  const carry = (month, since) => {
    const spent = new Map(
      db
        .prepare(
          `SELECT substr(date,1,7) AS month, SUM(-amount_cents) AS spent FROM transactions
            WHERE deleted_at IS NULL AND ${NOT_A_TRANSFER} AND amount_cents < 0
              AND date >= ? AND date < ? GROUP BY month`,
        )
        .all(`${shift(month, -WINDOW)}-01`, `${month}-01`)
        .map((r) => [r.month, r.spent]),
    );
    let total = 0;
    for (let back = WINDOW; back >= 1; back--) {
      const past = shift(month, -back);
      if (since && past < since) continue;
      total += 20000 - (spent.get(past) ?? 0);
    }
    return total;
  };

  check('Jan +5000, Feb −5000, Mar +10000, Apr +20000', carry('2026-05', '2026-01'), 30000);
  check('switching on this month carries nothing', carry('2026-05', '2026-05'), 0);

  // May holds a −9999 row. If the current month were counted the carry would move,
  // so adding more spending to it must change nothing.
  const beforeMaySpend = carry('2026-05', '2026-01');
  row(db, { amount: -5000, date: '2026-05-20' });
  check('spending this month does not change what was carried in', carry('2026-05', '2026-01'), beforeMaySpend);
  check(
    'without a start month, quiet earlier months would be credited',
    carry('2026-05', null) > carry('2026-05', '2026-01'),
    true,
  );
}

// ── Accounts backfill ────────────────────────────────────────────────────────

section('The accounts backfill leaves nothing orphaned');
{
  // Stop before migration 8, which is the state an install was in before accounts.
  const db = openMigratedDb({ upTo: 7 });
  db.exec(`INSERT INTO settings (key, value, updated_at) VALUES ('currency', 'GBP', 'n')`);
  db.exec(`INSERT INTO categories
    (id, household_id, name, kind, color, icon, sort_order, archived, created_at, updated_at, deleted_at)
    VALUES ('c1', NULL, 'Groceries', 'expense', '#009B4D', '', 0, 0, 'n', 'n', NULL)`);
  db.prepare(
    `INSERT INTO transactions
       (id, household_id, account_id, category_id, amount_cents, date, description, notes, source,
        import_hash, recurring_id, created_at, updated_at, deleted_at)
     VALUES ('a', NULL, NULL, 'c1', -1000, '2026-08-01', 'x', NULL, 'manual', NULL, NULL, 'n', 'n', NULL),
            ('b', NULL, NULL, 'c1', -700, '2026-08-01', 'x', NULL, 'manual', NULL, NULL, 'n', 'n', 'n')`,
  ).run();

  check(
    'nothing has an account beforehand',
    db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id IS NOT NULL').get().n,
    0,
  );

  const { loadMigrations } = await import('./lib/schema.mjs');
  db.exec(loadMigrations()[7]);

  const account = db.prepare("SELECT * FROM accounts WHERE id = 'seed-account-main'").get();
  check('the seed took the ledger currency', account.currency, 'GBP');
  check(
    'timestamps match the ISO-8601 the app writes',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(account.created_at),
    true,
  );
  check(
    'no live row is left without an account',
    db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL AND account_id IS NULL').get().n,
    0,
  );
  check(
    'and neither is a trashed one, so restoring it keeps an account',
    db.prepare("SELECT account_id FROM transactions WHERE id = 'b'").get().account_id,
    'seed-account-main',
  );
}

report('ledger');
