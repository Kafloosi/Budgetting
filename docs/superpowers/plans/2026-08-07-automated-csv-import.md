# Automated CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bank statement opened from another app lands in Fare's ledger, categorised, without passing through the mapping screen.

**Architecture:** The import pipeline comes out of the `run()` closure in `src/app/import.tsx` into a native-free `src/lib/import-run.ts`, so one implementation serves both the screen and the automatic path and a Node check can assert it. Fare registers as a `text/csv` handler through `app.json` alone — no config plugin proved necessary. A provider mounted inside `AppLockGate` catches the launch URL, reads the file, and either imports it straight through or opens today's screen with it loaded.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `expo-sqlite`, `expo-file-system` (`File`), `expo-linking`, `expo-notifications`, `node:sqlite` for the checks.

## Global Constraints

- Money is whole cents, never a float, not even briefly. Parsing lives in `lib/money.ts`.
- `1.234` is Dutch thousands. A trailing minus is a debit.
- `nth === 0` in `lib/fingerprint.ts` must stay byte-identical to `date|cents|description`.
- Amounts are signed. Expenses negative, income positive.
- IDs are UUIDs via `newId()`. Deletes are soft; every read carries `WHERE deleted_at IS NULL`.
- SQL only in `db/repositories/`. Screens call repo functions.
- Reads use `useLedgerQuery`; after every write call `useInvalidateLedger()`.
- `MIGRATIONS` is append-only. **This feature adds no migration.**
- No `console.*` anywhere in `src/`.
- Every amount rendered goes through `Money`. Pill or plate, nothing between.
- One change, one commit, each bumping `package.json`, `app.json` and `package-lock.json` together.
- `npm run typecheck`, `npm run lint` and `npm run check` must all exit 0 before any commit.
- `android.versionCode` bumps only on the final task — the one meant to be installed.
- **Do not push.** The user is holding this version for a second feature.

## Decisions taken during planning

Verified against `https://docs.expo.dev/versions/v57.0.0/`, per `AGENTS.md`.

1. **Android uses `ACTION_VIEW` only.** `expo-linking` in SDK 57 exposes no way to read `Intent.EXTRA_STREAM`, where `ACTION_SEND` puts the URI — `getInitialURL()` reads `intent.getData()`, which `ACTION_SEND` leaves empty. Supporting the share sheet therefore needs a native shim or a third-party package, and the spec says that comes back as a question rather than arriving in a diff. `ACTION_VIEW` covers *Open with* and tapping the download notification, which is how banking apps deliver a statement in practice.
2. **No config plugin is needed.** `android.intentFilters` in `app.json` takes `data.mimeType` directly, and `ios.infoPlist` accepts `CFBundleDocumentTypes`. The spec anticipated plugin work modelled on `with-quick-add-shortcut`; it turned out unnecessary. Less to maintain.
3. **`lib/import-run.ts` takes the hash and category matcher as parameters** and imports nothing native. `importSource()` in the check harness executes a module's imports, so anything reaching for `expo-crypto` cannot be checked on Node. This mirrors the existing split the repo already justifies: `lib/fingerprint.ts` holds the decision, `db/hash.ts` holds the digest.
4. **The app-lock case needs no queue.** `AppLockGate` renders its children only once unlocked, so a provider mounted inside it cannot run while the lock is up, and `Linking.getLinkingURL()` still returns the launch URL when it finally mounts.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/import-run.ts` | **Create.** Rows + mapping → transaction inputs. Native-free, so Node can check it |
| `scripts/check-import-run.mjs` | **Create.** Asserts the above against a real schema |
| `scripts/check-all.mjs` | **Modify.** Register the new check |
| `src/db/repositories/transactions.ts` | **Modify.** `bulkInsertImported` returns inserted ids; add `runImport` and `undoImport` |
| `src/app/import.tsx` | **Modify.** Calls `runImport`; accepts a preloaded file |
| `src/lib/incoming-file.ts` | **Create.** A delivered URI → `{ name, text }`, size-capped, deleted after |
| `app.json` | **Modify.** Register as a CSV handler on both platforms |
| `scripts/check-app-config.mjs` | **Create.** Guards the handler registration against a silent regression |
| `src/providers/incoming.tsx` | **Create.** Catches the launch URL, routes it |
| `src/lib/import-nudge.ts` | **Create.** Days since the last import, and the threshold |
| `README.md` | **Modify.** The feature table currently lies about this |

---

### Task 1: Extract the import pipeline

**Files:**
- Create: `src/lib/import-run.ts`
- Create: `scripts/check-import-run.mjs`
- Modify: `scripts/check-all.mjs:17-24`
- Modify: `src/app/import.tsx:158-198`

**Interfaces:**
- Consumes: `toDraft`, `Mapping`, `Draft` from `@/lib/csv`; `assignOrdinals` from `@/lib/fingerprint`; `TransactionInput` from `@/db/repositories/transactions` (**as `import type` — a value import would pull `expo-sqlite` into Node and break the check**).
- Produces: `buildImportInputs(rows, mapping, matchCategory, hash) => Promise<BuiltImport>`, `type HashFn`, `type MatchFn`, `interface BuiltImport { inputs: TransactionInput[]; invalid: number }`.

- [ ] **Step 1: Write the failing check**

Create `scripts/check-import-run.mjs`:

```js
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/check-import-run.mjs`
Expected: FAIL — `Cannot find module .../src/lib/import-run.ts`.

- [ ] **Step 3: Write `src/lib/import-run.ts`**

```ts
/**
 * A statement, turned into rows the ledger will accept.
 *
 * Lifted out of the import screen so the automatic path and the manual one run
 * the same code. There is one rule about which rows count as the same
 * transaction, and a second copy of it is the last thing this repo needs.
 *
 * The digest and the rule matcher arrive as arguments rather than as imports.
 * Both reach for something native — `expo-crypto` and the database — and this
 * file is checked on Node, where neither exists. It is the same division as
 * `lib/fingerprint.ts` against `db/hash.ts`, for the same reason.
 */

import type { TransactionInput } from '@/db/repositories/transactions';
import { toDraft, type Draft, type Mapping } from '@/lib/csv';
import { assignOrdinals } from '@/lib/fingerprint';

/** `db/hash.ts`'s `importHash`, passed in. */
export type HashFn = (
  date: string,
  amountCents: number,
  description: string,
  nth: number,
) => Promise<string>;

/** `loadRuleMatcher`'s return, passed in. */
export type MatchFn = (description: string) => string | null;

export interface BuiltImport {
  /** Rows ready for `bulkInsertImported`, in the file's own order. */
  inputs: TransactionInput[];
  /**
   * How many rows the mapping could not read.
   *
   * The screen could count these from its own preview; an automatic import has
   * no preview, and dropping rows out of a file nobody looked at is the failure
   * worth refusing to make silent.
   */
  invalid: number;
}

export async function buildImportInputs(
  rows: string[][],
  mapping: Mapping,
  matchCategory: MatchFn,
  hash: HashFn,
): Promise<BuiltImport> {
  const drafts = rows
    .map((row) => toDraft(row, mapping))
    .filter((draft): draft is Draft => draft !== null);

  const inputs: TransactionInput[] = [];
  for (const draft of assignOrdinals(drafts)) {
    inputs.push({
      amount_cents: draft.amount_cents,
      date: draft.date,
      description: draft.description,
      category_id: matchCategory(draft.description),
      source: 'import',
      import_hash: await hash(draft.date, draft.amount_cents, draft.description, draft.nth),
    });
  }

  return { inputs, invalid: rows.length - drafts.length };
}
```

- [ ] **Step 4: Run the check and watch it pass**

Run: `node scripts/check-import-run.mjs`
Expected: PASS, every section.

- [ ] **Step 5: Register it in `npm run check`**

In `scripts/check-all.mjs`, add `'check-import-run.mjs',` to the `CHECKS` array, after `'check-fingerprint.mjs'` — dedupe first, then what feeds it.

- [ ] **Step 6: Point the screen at it**

In `src/app/import.tsx`, replace the body of `run()` between `setBusy(true)` and the `bulkInsertImported` call. Delete the now-unused imports of `assignOrdinals`, `toDraft` (keep it if the preview still uses it — it does, at line 152) and `importHash`, and add `buildImportInputs`:

```ts
  async function run() {
    if (!csv || !mapping || busy) return;
    setBusy(true);
    try {
      // Loaded once for the whole statement rather than queried per row.
      const matchCategory = await loadRuleMatcher(db);
      const { inputs } = await buildImportInputs(csv.rows, mapping, matchCategory, importHash);

      const outcome = await bulkInsertImported(db, inputs);
      invalidate();
      setResult({ ...outcome, waiting: await countUncategorised(db) });
    } catch (importError) {
      setError(`The import stopped. ${(importError as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 7: Verify nothing else broke**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run check`
Expected: all three exit 0, and `check` now reports 7 files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/import-run.ts scripts/check-import-run.mjs scripts/check-all.mjs src/app/import.tsx package.json app.json package-lock.json
git commit -m "0.2.0.2 — the import pipeline leaves the screen"
```

Bump `version` to `0.2.0.2` in `package.json`, `app.json` and both places in `package-lock.json` first. Behaviour is unchanged; this is the refactor that makes the rest small.

---

### Task 2: The ledger hands back what it inserted

**Files:**
- Modify: `src/db/repositories/transactions.ts:186-228`

**Interfaces:**
- Consumes: `buildImportInputs` from Task 1.
- Produces: `bulkInsertImported` now returns `{ inserted, skipped, ids }`; new `runImport(db, rows, mapping) => Promise<ImportOutcome>` and `undoImport(db, ids) => Promise<void>`. `ImportOutcome` is `{ inserted: number; skipped: number; invalid: number; ids: string[] }`.

- [ ] **Step 1: Extend `BulkInsertResult` and capture the ids**

`newId()` is currently called inline inside the `runAsync` arguments, so the id is generated and forgotten. Hoist it, and keep it only when the row actually landed — `INSERT OR IGNORE` means a duplicate produces no row and must contribute no id.

```ts
export interface BulkInsertResult {
  inserted: number;
  skipped: number;
  /** Ids of the rows that actually landed, so an import can be taken back. */
  ids: string[];
}
```

In `bulkInsertImported`, replace the loop body's id handling:

```ts
  await withTransaction(db, async (txn) => {
    for (const row of rows) {
      // Generated up front rather than inline, because a row that collides on
      // import_hash inserts nothing and must not contribute an id to undo.
      const id = newId();
      const result = await txn.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, household_id, account_id, category_id, amount_cents, date, description,
            notes, source, import_hash, created_at, updated_at, deleted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, NULL)`,
        [
          id,
          row.account_id ?? fallbackAccount,
          row.category_id,
          row.amount_cents,
          row.date,
          row.description,
          row.notes ?? null,
          row.import_hash ?? null,
          now,
          now,
        ],
      );
      if (result.changes > 0) {
        inserted++;
        ids.push(id);
      }
    }
  });

  return { inserted, skipped: rows.length - inserted, ids };
```

Declare `const ids: string[] = [];` beside `let inserted = 0;`.

- [ ] **Step 2: Add `runImport` and `undoImport` below it**

```ts
export interface ImportOutcome {
  inserted: number;
  skipped: number;
  /** Rows the mapping could not read. */
  invalid: number;
  ids: string[];
}

/**
 * One statement, from rows of text to rows in the ledger.
 *
 * The single way in. Both the import screen and a file arriving from another app
 * come through here, so there is one answer to what counts as the same
 * transaction and one place it can change.
 */
export async function runImport(
  db: SQLiteDatabase,
  rows: string[][],
  mapping: Mapping,
): Promise<ImportOutcome> {
  const matchCategory = await loadRuleMatcher(db);
  const { inputs, invalid } = await buildImportInputs(rows, mapping, matchCategory, importHash);
  const outcome = await bulkInsertImported(db, inputs);
  return { ...outcome, invalid };
}

/**
 * Takes an import back.
 *
 * Soft, like every other delete here, so the rows land in trash rather than
 * vanishing — and so their import_hash keeps colliding, which is what stops an
 * undone import from silently re-landing on the next attempt.
 */
export async function undoImport(db: SQLiteDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = nowIso();
  await withTransaction(db, async (txn) => {
    for (const id of ids) {
      await txn.runAsync(
        'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, id],
      );
    }
  });
}
```

Add the imports this needs at the top of the file: `import { importHash } from '../hash';`, `import { loadRuleMatcher } from './import-rules';`, `import { buildImportInputs } from '@/lib/import-run';`, and `import type { Mapping } from '@/lib/csv';`.

- [ ] **Step 3: Simplify the screen onto `runImport`**

`src/app/import.tsx`'s `run()` becomes:

```ts
  async function run() {
    if (!csv || !mapping || busy) return;
    setBusy(true);
    try {
      const outcome = await runImport(db, csv.rows, mapping);
      invalidate();
      setResult({ ...outcome, waiting: await countUncategorised(db) });
    } catch (importError) {
      setError(`The import stopped. ${(importError as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
```

Drop the now-unused imports of `buildImportInputs`, `loadRuleMatcher` and `importHash` from the screen. The screen no longer knows how an import works, which is the point.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run check`
Expected: all exit 0.

Note honestly: `bulkInsertImported` and `undoImport` cannot be checked on Node — `newId()` reaches for `expo-crypto`. They are verified on the device in Task 6's walkthrough.

- [ ] **Step 5: Commit**

Bump to `0.2.0.3`, then:

```bash
git add src/db/repositories/transactions.ts src/app/import.tsx package.json app.json package-lock.json
git commit -m "0.2.0.3 — an import can be taken back"
```

---

### Task 3: Reading a file that arrived from somewhere else

**Files:**
- Create: `src/lib/incoming-file.ts`

**Interfaces:**
- Produces: `readIncomingFile(uri) => Promise<IncomingFile>`, `interface IncomingFile { name: string; text: string }`, `const MAX_INCOMING_BYTES = 10 * 1024 * 1024`, `class IncomingFileError extends Error`.

- [ ] **Step 1: Write the module**

```ts
/**
 * A file handed to Fare by another app.
 *
 * Different from a file the user picked, in one way that matters: nobody chose
 * it inside Fare, so nothing about it has been looked at. It is checked for size
 * before it is read, because `File.text()` on something large enough is a crash
 * rather than an error message, and it is deleted afterwards, because iOS leaves
 * received documents sitting in the app's Inbox until something removes them.
 */

import { File } from 'expo-file-system';

/**
 * Two orders of magnitude above a year of statements, and far below anything
 * that costs memory. A real monthly export is tens of kilobytes.
 */
export const MAX_INCOMING_BYTES = 10 * 1024 * 1024;

export interface IncomingFile {
  name: string;
  text: string;
}

/** Refused for a reason the user can act on, rather than a stack trace. */
export class IncomingFileError extends Error {}

export async function readIncomingFile(uri: string): Promise<IncomingFile> {
  const file = new File(uri);

  if (!file.exists) {
    throw new IncomingFileError('That file is no longer there.');
  }

  if (file.size > MAX_INCOMING_BYTES) {
    const megabytes = Math.round(file.size / (1024 * 1024));
    throw new IncomingFileError(
      `${file.name} is ${megabytes} MB. A statement is normally a few hundred kilobytes, so this is not one.`,
    );
  }

  const name = file.name;
  const text = await file.text();

  // Best effort. A copy left behind is untidy rather than dangerous, and on
  // Android the URI often belongs to the sending app and is not ours to remove.
  try {
    file.delete();
  } catch {
    // Nothing to do about it, and nothing that depends on it having worked.
  }

  return { name, text };
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Run: `npm run lint`
Expected: both exit 0.

This module cannot be checked on Node — `expo-file-system` is native. It is verified on the device in Task 6.

- [ ] **Step 3: Commit**

Bump to `0.2.0.4`, then:

```bash
git add src/lib/incoming-file.ts package.json app.json package-lock.json
git commit -m "0.2.0.4 — reading a file nobody picked"
```

---

### Task 4: Register Fare as something a CSV opens with

**Files:**
- Modify: `app.json`
- Create: `scripts/check-app-config.mjs`
- Modify: `scripts/check-all.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: the OS-level registration Task 5 depends on.

- [ ] **Step 1: Add the Android intent filter**

In `app.json`, `expo.android.intentFilters` already holds one entry for the `fare` scheme. Add a second, alongside it:

```json
      {
        "action": "VIEW",
        "category": ["DEFAULT", "BROWSABLE"],
        "data": [
          { "mimeType": "text/csv" },
          { "mimeType": "text/comma-separated-values" },
          { "mimeType": "application/csv" }
        ]
      }
```

Three MIME types because banks and file managers disagree about which one a `.csv` is, and a statement that opens in one app but not another is the bug this feature exists to remove.

- [ ] **Step 2: Add the iOS document type**

In `app.json`, under `expo.ios`, add:

```json
      "infoPlist": {
        "CFBundleDocumentTypes": [
          {
            "CFBundleTypeName": "Comma-separated values",
            "CFBundleTypeRole": "Viewer",
            "LSHandlerRank": "Alternate",
            "LSItemContentTypes": ["public.comma-separated-values-text"]
          }
        ]
      }
```

`LSHandlerRank: Alternate` rather than `Owner`: Fare reads CSVs, it does not own them, and claiming otherwise would put it above Numbers in the share sheet for every spreadsheet on the phone.

If `expo.ios` already carries an `infoPlist`, merge into it rather than replacing it.

- [ ] **Step 3: Write the check**

Create `scripts/check-app-config.mjs`:

```js
/**
 * The file-handler registration.
 *
 * `android/` and `ios/` are gitignored and regenerated by every prebuild, so
 * this declaration in app.json is the only copy. It is four lines of JSON that
 * nothing references from code, which makes it exactly the kind of thing that
 * gets dropped in a merge and noticed a release later.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { check, report, section } from './lib/check.mjs';
import { ROOT } from './lib/schema.mjs';

const config = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;

section('Android opens a CSV with Fare');
{
  const filters = config.android?.intentFilters ?? [];
  const mimeTypes = filters
    .filter((filter) => filter.action === 'VIEW')
    .flatMap((filter) => filter.data ?? [])
    .map((data) => data.mimeType)
    .filter(Boolean);

  check('text/csv is claimed', mimeTypes.includes('text/csv'), true);
  check('and the two names banks also use', 
    mimeTypes.includes('text/comma-separated-values') && mimeTypes.includes('application/csv'),
    true);
}

section('iOS offers Fare in the share sheet');
{
  const types = config.ios?.infoPlist?.CFBundleDocumentTypes ?? [];
  const contentTypes = types.flatMap((type) => type.LSItemContentTypes ?? []);
  check('the CSV UTI is declared', contentTypes.includes('public.comma-separated-values-text'), true);
  check('as a viewer, not an owner', types.every((type) => type.LSHandlerRank !== 'Owner'), true);
}

section('The deep link scheme still works');
{
  check('scheme is fare', config.scheme, 'fare');
}

report('app-config');
```

- [ ] **Step 4: Register and run it**

Add `'check-app-config.mjs',` to `CHECKS` in `scripts/check-all.mjs`.

Run: `node scripts/check-app-config.mjs`
Expected: PASS, every section.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run check`
Expected: all exit 0, 8 check files.

- [ ] **Step 6: Commit**

Bump to `0.2.0.5`, then:

```bash
git add app.json scripts/check-app-config.mjs scripts/check-all.mjs package.json package-lock.json
git commit -m "0.2.0.5 — a CSV can be opened with Fare"
```

---

### Task 5: Catch the file and decide what to do with it

**Files:**
- Create: `src/providers/incoming.tsx`
- Modify: `src/app/_layout.tsx:69-73`
- Modify: `src/app/import.tsx`

**Interfaces:**
- Consumes: `readIncomingFile`, `IncomingFileError` (Task 3); `runImport` (Task 2); `findPresetForHeader`, `headerSignature` from `@/db/repositories/import-presets`; `parseCsv` from `@/lib/csv`.
- Produces: `<IncomingFileProvider>`, and a router param contract — `router.push({ pathname: '/import', params: { incomingName, incomingText } })`.

- [ ] **Step 1: Write the provider**

```tsx
/**
 * A statement that arrives instead of being fetched.
 *
 * Mounted inside AppLockGate deliberately. That gate renders its children only
 * once the lock is open, so this cannot run while the app is locked, and the
 * launch URL is still there to be read when it finally mounts. A file arriving
 * from another app is not a way past the lock, and it takes no queue to say so.
 *
 * A recognised format goes straight into the ledger. An unrecognised one is
 * handed to the import screen, which is the same screen it would have reached by
 * hand — one step shorter, because the file is already open.
 */

import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, type ReactNode } from 'react';

import { findPresetForHeader } from '@/db/repositories/import-presets';
import { runImport, undoImport } from '@/db/repositories/transactions';
import { parseCsv, type DateFormat } from '@/lib/csv';
import { IncomingFileError, readIncomingFile } from '@/lib/incoming-file';
import { useInvalidateLedger } from '@/providers/ledger';
import { useUndo } from '@/providers/undo';

export function IncomingFileProvider({ children }: { children: ReactNode }) {
  const url = useLinkingURL();
  const db = useSQLiteContext();
  const router = useRouter();
  const invalidate = useInvalidateLedger();
  const { offer } = useUndo();

  // The same launch URL is returned for as long as the app lives, so without
  // this the file would import again on every re-render.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handled.current === url) return;
    // fare:// links are routes, and expo-router already owns them.
    if (url.startsWith('fare://')) return;
    handled.current = url;

    let cancelled = false;

    (async () => {
      try {
        const { name, text } = await readIncomingFile(url);
        if (cancelled) return;

        const csv = parseCsv(text);
        if (csv.rows.length === 0) {
          offer(`${name} has no transactions in it`, () => {});
          return;
        }

        const preset = await findPresetForHeader(db, csv.header);
        if (cancelled) return;

        if (!preset) {
          // Never seen this bank's columns. The screen asks, once, and saving
          // the format there is what makes every later file automatic.
          router.push({
            pathname: '/import',
            params: { incomingName: name, incomingText: text },
          });
          return;
        }

        const outcome = await runImport(db, csv.rows, {
          date: preset.date_column,
          amount: preset.amount_column,
          description: preset.description_column,
          format: preset.date_format as DateFormat,
          allNegative: preset.all_negative === 1,
        });
        if (cancelled) return;

        invalidate();

        if (outcome.inserted === 0) {
          offer(`${preset.name}: nothing new`, () => {});
          return;
        }

        offer(`${outcome.inserted} added from ${preset.name}`, async () => {
          await undoImport(db, outcome.ids);
          invalidate();
        });
      } catch (error) {
        const message =
          error instanceof IncomingFileError
            ? error.message
            : `That file could not be read. ${(error as Error).message}`;
        if (!cancelled) offer(message, () => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, db, router, invalidate, offer]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Note the undo bar's shape**

Verified during planning: `src/providers/undo.tsx:78` exports `useUndo(): UndoValue`, and `UndoValue` is `{ offer: (message: string, undo: () => void | Promise<void>) => void }`. The provider above uses it correctly — no change needed here.

`offer` takes a required callback, so the "nothing new" and error cases pass `() => {}`. That is deliberate: widening a shared component's signature so it can also show a message is scope this task does not own. If the bar looks wrong for a message with nothing to undo, raise it rather than changing `undo.tsx` here.

- [ ] **Step 3: Mount it**

In `src/app/_layout.tsx`, wrap `Navigation` — inside both `AppLockGate` and `UndoProvider`, because it needs the undo bar and must not run while locked:

```tsx
                  <AppLockGate>
                    <UndoProvider>
                      <IncomingFileProvider>
                        <Navigation />
                      </IncomingFileProvider>
                    </UndoProvider>
                  </AppLockGate>
```

Add `import { IncomingFileProvider } from '@/providers/incoming';` with the other provider imports.

- [ ] **Step 4: Teach the import screen to accept a preloaded file**

In `src/app/import.tsx`, add `useLocalSearchParams` to the `expo-router` import, and load the handed-over file once on mount:

```tsx
  const { incomingName, incomingText } = useLocalSearchParams<{
    incomingName?: string;
    incomingText?: string;
  }>();

  // A file handed over by the provider is loaded exactly as a picked one is,
  // so the screen below this line cannot tell the difference.
  const loadedIncoming = useRef(false);
  useEffect(() => {
    if (loadedIncoming.current || !incomingText || !incomingName) return;
    loadedIncoming.current = true;
    load(incomingText, incomingName);
  }, [incomingText, incomingName]);
```

Then split the existing `pick()` so the parsing half is reusable — `pick()` keeps the picker and calls `load()`:

```tsx
  function load(text: string, name: string) {
    try {
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        setError('That file has a heading row but no transactions in it.');
        return;
      }
      setCsv(parsed);
      setFileName(name);
      setResult(null);
      setSavedMapping(null);

      // A format saved from this bank's last export beats guessing at the
      // headings, so it is applied without asking.
      findPresetForHeader(db, parsed.header).then((preset) => {
        if (preset) {
          setRecognised(preset.name);
          setPresetName(preset.name);
          setMapping({
            date: preset.date_column,
            amount: preset.amount_column,
            description: preset.description_column,
            format: preset.date_format as DateFormat,
            allNegative: preset.all_negative === 1,
          });
          return;
        }
        setRecognised(null);
        setPresetName('');
        const guessed = guessColumns(parsed.header);
        setMapping({
          ...guessed,
          format: guessDateFormat(parsed.rows.map((row) => row[guessed.date] ?? '')),
          allNegative: false,
        });
      });
    } catch (readError) {
      setError(`Could not read that file. ${(readError as Error).message}`);
    }
  }

  async function pick() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    try {
      load(await new File(asset.uri).text(), asset.name);
    } catch (readError) {
      setError(`Could not read that file. ${(readError as Error).message}`);
    }
  }
```

Add `useEffect` and `useRef` to the `react` import.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run check`
Expected: all exit 0.

- [ ] **Step 6: Commit**

Bump to `0.2.0.6`, then:

```bash
git add src/providers/incoming.tsx src/app/_layout.tsx src/app/import.tsx package.json app.json package-lock.json
git commit -m "0.2.0.6 — a statement that arrives by itself"
```

---

### Task 6: Walk it on a device

**Files:** none. This task is the check the others cannot be.

**Interfaces:**
- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: Build a dev client**

Expo Go cannot register custom intent filters or document types — they are baked into the binary at build time. This needs a real build:

Run: `npx expo run:android`

If the Android SDK is not set up, the alternative is a `workflow_dispatch` run of `.github/workflows/android.yml` and installing the APK by hand.

- [ ] **Step 2: Teach it one bank, by hand**

Import an ING or Rabobank export through Settings → Import as today, map the columns, and **save the format** with the bank's name. This is what creates the preset every later file is recognised by.

- [ ] **Step 3: A recognised file, opened from outside**

Put the same CSV in Downloads. Open the file manager, tap it, choose Fare.

Expected: Fare opens, no mapping screen, the undo bar reads `0 added from <bank>` — nothing new, because those rows are already in from Step 2. This is the dedupe working, not a failure.

- [ ] **Step 4: A recognised file with genuinely new rows**

Export a fresh statement covering a later period. Open it the same way.

Expected: `N added from <bank>`. The rows appear on Month and in the Ledger, categorised where a rule matched. Tap **Undo** within five seconds; they leave the ledger and appear in Trash.

- [ ] **Step 5: An unrecognised file**

Open a CSV with different headings — a different bank, or the same file with a renamed first column.

Expected: the import screen opens with the file already loaded and the column guesses filled in. No file picker.

- [ ] **Step 6: The lock**

Turn on the app lock in Settings. Kill Fare. Open a CSV from the file manager.

Expected: the lock screen, and nothing imported behind it. After authenticating, the import proceeds.

- [ ] **Step 7: A file that is not a statement**

Open any other CSV — an address book, a spreadsheet export.

Expected: either the mapping screen with nonsense guesses the user can back out of, or a clear message. **Not** a crash, and not rows in the ledger.

- [ ] **Step 8: Record what happened**

If any step failed, fix it and re-run the affected steps before continuing. If a step revealed a design problem rather than a bug, stop and raise it rather than working around it.

- [ ] **Step 9: Commit any fixes**

Bump the fourth position for each fix. No commit if nothing needed fixing.

---

### Task 7: The nudge

**Files:**
- Create: `src/lib/import-nudge.ts`
- Modify: `src/db/repositories/transactions.ts`
- Modify: `src/providers/incoming.tsx`

**Interfaces:**
- Consumes: `lastImportAt` (added below); the notification pattern in `src/lib/budget-alerts.ts`.
- Produces: `daysSinceImport(last, now) => number | null`, `NUDGE_AFTER_DAYS = 14`, `shouldNudge(last, now, enabled) => boolean`.

- [ ] **Step 1: Add the query**

In `src/db/repositories/transactions.ts`:

```ts
/**
 * When a statement was last read in, or null if one never has been.
 *
 * Derived rather than recorded. A column would be a migration, and the ledger
 * already knows — an imported row is the only kind that carries source 'import'.
 */
export async function lastImportAt(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ last: string | null }>(
    "SELECT MAX(created_at) AS last FROM transactions WHERE source = 'import' AND deleted_at IS NULL",
  );
  return row?.last ?? null;
}
```

- [ ] **Step 2: Write the decision, native-free**

Create `src/lib/import-nudge.ts`:

```ts
/**
 * Reminding someone their ledger has gone quiet.
 *
 * Kept away from the notification API so the rule about *when* is checkable, in
 * the same way `lib/fingerprint.ts` is kept away from the digest.
 */

/**
 * Long enough that a monthly statement does not get nagged about twice, short
 * enough that a forgotten month is caught inside it.
 */
export const NUDGE_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between the last import and now. Null when nothing was imported. */
export function daysSinceImport(last: string | null, now: Date): number | null {
  if (!last) return null;
  const then = new Date(last);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

/**
 * Whether to say something.
 *
 * Silent until the first import has happened. Reminding someone to do a thing
 * they have never done is not a reminder, and the first import is also the one
 * that teaches Fare the format — before that, the nudge cannot deliver what it
 * offers.
 */
export function shouldNudge(last: string | null, now: Date, enabled: boolean): boolean {
  if (!enabled) return false;
  const days = daysSinceImport(last, now);
  return days !== null && days >= NUDGE_AFTER_DAYS;
}
```

- [ ] **Step 3: Add its check**

Append to `scripts/check-import-run.mjs`, before `report('import-run')`:

```js
const { daysSinceImport, shouldNudge, NUDGE_AFTER_DAYS } = await importSource(
  'src/lib/import-nudge.ts',
);

section('The nudge stays quiet until there is something to be quiet about');
{
  const now = new Date('2026-08-07T12:00:00.000Z');
  check('never imported, never nudged', shouldNudge(null, now, true), false);
  check('imported today', shouldNudge('2026-08-07T09:00:00.000Z', now, true), false);
  check('thirteen days', shouldNudge('2026-07-25T12:00:00.000Z', now, true), false);
  check('fourteen days', shouldNudge('2026-07-24T12:00:00.000Z', now, true), true);
  check('turned off', shouldNudge('2026-01-01T12:00:00.000Z', now, false), false);
  check('the threshold is fourteen', NUDGE_AFTER_DAYS, 14);
  check('days are whole', daysSinceImport('2026-08-01T23:00:00.000Z', now), 5);
  check('a nonsense timestamp nudges nothing', daysSinceImport('not a date', now), null);
}
```

- [ ] **Step 4: Run it**

Run: `node scripts/check-import-run.mjs`
Expected: PASS, including the new section.

- [ ] **Step 5: Wire the notification**

Read `src/lib/budget-alerts.ts` first and follow whatever it does — the permission request, the scheduling call, and the settings key it reads. Add the nudge alongside it using the same shapes, reading `lastImportAt(db)` and `shouldNudge(...)`, with a settings key `import_nudge_enabled` defaulting to on. Tapping the notification opens `fare://import`.

Do not invent a second notification mechanism. If `budget-alerts.ts` has a registry of scheduled notifications, add to it.

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run check`
Expected: all exit 0.

- [ ] **Step 7: Commit**

Bump to `0.2.0.7`, then:

```bash
git add src/lib/import-nudge.ts src/db/repositories/transactions.ts scripts/check-import-run.mjs src/lib/budget-alerts.ts src/providers/settings.tsx package.json app.json package-lock.json
git commit -m "0.2.0.7 — a nudge when the ledger goes quiet"
```

Adjust the staged paths to what actually changed.

---

### Task 8: Tell the truth in the README

**Files:**
- Modify: `README.md:27-46` and `README.md:233-238`

**Interfaces:** none.

- [ ] **Step 1: Fix the feature table**

Three rows are wrong today, and two of them were already wrong before this feature:

- `Budget alert notifications` says **Not started**. `src/lib/budget-alerts.ts` and `src/lib/notifications.ts` both ship. Change to **Built**.
- `Receipt photos` says **Not started**. `src/lib/receipts.ts` ships. Change to **Built**.
- Add a row: `| Statements opened straight from the banking app | Built |`

- [ ] **Step 2: Fix "Next steps"**

The list names two things that are done. Replace it with what is actually next:

```markdown
1. Encrypted export, then SQLCipher with a device-bound key (`AUDIT.md`, F-01).
2. Share-sheet delivery on Android — `ACTION_SEND` needs a native shim that
   `expo-linking` does not provide.
3. Per-bank CSV presets shipped by default, rather than learned on first import.
4. Store identity: screenshots, listing copy, and an EAS build for iOS.
```

- [ ] **Step 3: Describe the feature**

Under `## Verifying a change`, extend the loop worth walking with the new path:

```markdown
Then the automatic path: open a statement from the file manager and choose Fare.
A format it has seen before lands in the ledger with an undo bar and no mapping
screen; one it has not opens the import screen with the file already loaded.
```

- [ ] **Step 4: Bump `android.versionCode`**

This is the commit meant to be installed. In `app.json`, set `android.versionCode` to `4`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm run check`
Expected: all exit 0.

- [ ] **Step 6: Commit**

Bump to `0.2.1.0` — the feature is complete, which is a smaller-but-important step rather than a fix.

```bash
git add README.md app.json package.json package-lock.json
git commit -m "0.2.1.0 — statements arrive by themselves"
```

**Do not push.** The user is holding this version for a second feature.

---

## Self-review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| CSV opened or shared from another app is handled | 4, 5 |
| Recognised format imports with no mapping screen | 5 |
| Undo on an automatic import | 2, 5 |
| Unrecognised format opens today's screen, preloaded | 5 |
| Staleness nudge, 14 days, off until first import | 7 |
| `lib/import-run.ts` extracted, one pipeline | 1, 2 |
| `invalid` count surfaced | 1, 2 |
| `lib/incoming-file.ts`, 10 MB cap, deleted after | 3 |
| App lock not bypassable | 5 (structural), 6 (verified) |
| Same file twice inserts nothing | 1 (checked), 6 (verified) |
| No migration | Confirmed — nothing in this plan touches `db/migrations.ts` |
| `check-import-run.mjs` against a real schema | 1 |
| Device walkthrough | 6 |

**Not covered, deliberately:** `ACTION_SEND`. Decision 1 above records why, Task 8 Step 2 records it in the README as the next step. This is a reduction in scope from the spec's "shared", and the user should overturn it if the share sheet matters more than avoiding a dependency.

**Placeholders:** none. Task 5 Step 2 and Task 7 Step 5 instruct the implementer to read an existing file before writing — that is deliberate, because both wire into a shared component whose exact signature should not be guessed at from a plan.

**Type consistency:** `Mapping` (`{ date, amount, description, format, allNegative }`) is used identically in Tasks 1, 2 and 5. `ImportOutcome` gains `invalid` in Task 2 and is consumed in Task 5. `BulkInsertResult` gains `ids` in Task 2 and is consumed by `runImport` in the same task and `undoImport` in Task 5. `buildImportInputs`' signature is fixed in Task 1 and called only from `runImport` in Task 2.
