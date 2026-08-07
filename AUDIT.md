# Audit — 2026-08-07 — commit 6138c10

Phase 0 of the security programme. Read-only: no source file was modified to produce
this, and nothing below has been fixed yet.

## Summary

Fare's data-layer foundations are genuinely good, and several of the programme's
worst-case hypotheses are refuted outright: there is no `console.*` anywhere in
`src/`, foreign keys are enforced, IDs come from the platform CSPRNG, and import
fingerprints are SHA-256. The programme's suspicion that basic hygiene was missing is
wrong, and that matters because it means the remaining findings are real rather than
symptoms of general neglect.

What is confirmed is the central one. **The database is a plaintext SQLite file, and
`android.allowBackup` is unset — which on Android means `true`.** So a complete,
merchant-labelled financial history is both readable by anyone with offline file
access and, plausibly, already copied to the user's Google Drive. The biometric app
lock is a UI gate in front of that file: real against someone holding an unlocked
phone, worth nothing against anyone who can read storage.

Underneath, two data-correctness bugs are confirmed and both are the silent kind.
Money parsing routes every imported amount through a float, so `1.005` becomes 100
cents rather than 101. Import dedupe fingerprints on date + amount + description with
no occurrence counter, so **two identical coffees on the same day are one coffee** —
the second is silently discarded and the month's spending reads low.

One finding the programme did not anticipate: the backup restore path builds an
`INSERT` from column names taken out of the JSON file, which makes a hand-edited
backup an SQL injection vector into the user's own database.

## Hypothesis register

| ID | Hypothesis | Verdict | Evidence | Severity |
|----|-----------|---------|----------|----------|
| H-01 | DB is plaintext | **CONFIRMED** | No `PRAGMA key`, no `useSQLCipher`, no `op-sqlite` anywhere in `src/` or `app.json` | Critical |
| H-02 | DB is in OS backups | **CONFIRMED** | `allowBackup` absent from `app.json`; Android's platform default is `true` | Critical |
| H-03 | App lock is a UI gate only | **CONFIRMED** | `src/providers/app-lock.tsx:72` gates rendering only; the DB is opened unconditionally by `SQLiteProvider` in `_layout.tsx:65` | High |
| H-04 | Lock does not re-lock on background | **REFUTED** | `app-lock.tsx:57-70` listens to `AppState` and re-locks after a grace period | — |
| H-05 | Exports land in shared storage | **PARTLY REFUTED** | `backup.tsx:57` writes to `Paths.cache`, then `Sharing.shareAsync` — the user picks the destination; the cache copy is the residue | Medium |
| H-06 | Sensitive data in AsyncStorage/SecureStore | **REFUTED** | Neither is used. Settings live in the SQLite `settings` table | — |
| H-07 | WAL/SHM sidecars exist | **CONFIRMED** | `migrations.ts:400` sets `journal_mode = WAL`; `-wal` and `-shm` hold recent rows in the clear | Critical, in combination with H-01 |
| H-08 | Logging leaks row data | **REFUTED** | `grep -c "console\." src/` → **0** | — |
| H-09 | Malicious CSV abuses the parser | **CANNOT TELL** | `lib/csv.ts` is hand-rolled and bounded, but there is no fuzz or fixture coverage to say so with evidence | Medium |
| H-10 | Malicious backup corrupts the DB | **CONFIRMED** | See F-05. `restoreBackup` validates only `app` and `format` | High |
| H-11 | `PRAGMA foreign_keys` not set | **REFUTED** | `migrations.ts:401`, on the single connection `SQLiteProvider` opens | — |
| H-12 | A read misses `deleted_at IS NULL` | **REFUTED (by inspection)** | Every query in `db/repositories/` filters it; no counter-example found. Structurally unguarded though — see F-07 | Medium |
| H-13 | Raw SQL outside repositories | **CONFIRMED** | `src/lib/backup.ts` and `src/db/migrations.ts`. The migration runner is legitimate; `backup.ts` is not | Medium |
| H-14 | A query is not parameterised | **CONFIRMED, narrowly** | Values are bound everywhere, including `transactions.ts:60`'s `LIKE`. But `backup.ts:84` interpolates *column names* from file input — F-04 | High |
| H-15 | Migrations not transactional | **REFUTED** | `migrations.ts:405-415` wraps each in `withTransaction` and advances `user_version` inside it | — |
| H-16 | Newer backup restores into older build | **REFUTED** | `backup.ts:65-67` refuses a higher `format` with a clear message | — |
| H-17 | Purged rows remain recoverable | **CONFIRMED** | No `secure_delete`, no `VACUUM`. Purged rows persist in free pages | Medium |
| H-18 | `.gitignore` misses secret patterns | **PARTLY CONFIRMED** | Covers `*.jks`, `*.p12`, `.env*.local`. Missing `*.keystore`, `.env`, `*.b64`, `google-services.json`, `*.mobileprovision` | Medium |
| H-19 | A secret is in git history | **REFUTED** | No secret-shaped file was ever added in any branch | — |
| H-20 | Workflow actions unpinned | **CONFIRMED** | All five `uses:` lines are mutable tags (`actions/checkout@v7`, `softprops/action-gh-release@v2`, …). `permissions: contents: write` is top-level rather than per-job | High |
| H-21 | Agent directories leak information | **REFUTED** | `.claude/settings.json` and `.impeccable/questions` only; no paths, usernames or credentials | — |
| H-22 | `.vscode` leaks local paths | **REFUTED** | Nothing machine-specific | — |

## Findings

### F-01 · Critical · The ledger is a plaintext file the OS may be backing up

**Where:** absence of `PRAGMA key`; `app.json` has no `android.allowBackup`.
**What happens:** `budget.db`, plus its `-wal` and `-shm` sidecars, are readable SQLite.
Anyone with offline file access opens them in a free browser. Because `allowBackup`
defaults to `true`, Android's auto-backup may already have copied them to Drive, where
the protection is the user's Google password rather than their fingerprint.
**Who it affects:** T2 (partner with the passcode), T3 (thief or buyer of a resold
device), T4 (another app on a rooted device), T5 (the user's own cloud backup).
**Proposed fix:** the programme's §4.0 order, unchanged — encrypted export first and
verified on a second device, then SQLCipher with a `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
key, then `allowBackup: false`. The migration must delete `-wal` and `-shm`, not just
the main file.
**Test that would catch a regression:** a check that `PRAGMA cipher_version` returns
non-empty on a freshly opened database, run in CI.

### F-02 · Critical · Every imported amount passes through a float

**Where:** `src/lib/money.ts:65-69` — `Number(normalised)` then `Math.round(value * 100)`.
**What happens:** binary floating point makes `Math.round(1.005 * 100)` produce 100, not
101, and `Math.round(8.165 * 100)` produce 816, not 817. Across a statement this
produces totals that cannot be reconciled against the bank by a few cents. The comment
on line 68 shows the author knew rounding was delicate and reached for `Math.round`,
which fixes `19.99` and not `1.005`.
**Who it affects:** every user who imports a statement. Silent.
**Proposed fix:** parse as a string — split on the decimal separator, pad or truncate
the fraction to exactly two digits, concatenate, `parseInt`. Reject more than two
fractional digits rather than guessing, since a bank does not emit them and their
presence means the column mapping is wrong.
**Test that would catch a regression:** the table in the programme's B-03, including
`1.005 → 101` and `8.165 → 817`.

### F-03 · Critical · Two identical transactions on one day become one

**Where:** `src/db/hash.ts:32-41`, and the partial unique index at `migrations.ts:87`.
**What happens:** the fingerprint is `date | amount_cents | normalisedDescription`. Two
genuinely distinct transactions sharing all three — two coffees, two identical bus
fares, a retried subscription charge — collide, and `INSERT OR IGNORE` in
`bulkInsertImported` drops the second without a word. The user's spending reads low and
they have no way to know.
**Who it affects:** every user who imports. This is the most damaging finding here,
because unlike F-01 it is already producing wrong numbers.
**Proposed fix:** add an occurrence ordinal — hash over
`date | amount | description | nth`, where `nth` counts prior rows with the same triple
*within the file being imported*. Re-importing regenerates the same ordinals, so both
rows still collide and both are still skipped. Also disclose the skip count, which the
import screen already has the data for.
**Test that would catch a regression:** the two tests in the programme's B-01, which
must both pass — they are in direct tension and that tension is the design.

### F-04 · High · A backup file can inject SQL into the restore

**Where:** `src/lib/backup.ts:82-84` — `Object.keys(rows[0])` becomes
`INSERT INTO ${table} (${columns.join(', ')})`.
**What happens:** column names are taken from the JSON and interpolated into the
statement unquoted. A crafted backup with a key like `id) VALUES ('x'); DROP TABLE
transactions; --` executes. The table name is safe (it comes from a hardcoded array);
the column names are not.
**Who it affects:** T9 — a backup file handed to the user, or one edited by hand and
subtly wrong.
**Proposed fix:** validate every row against a per-table allowlist of known columns and
drop anything else, before building the statement. Combine with F-05.
**Test that would catch a regression:** a fixture backup carrying a malicious column
name; assert the restore refuses and the database is unchanged.

### F-05 · High · Restore trusts the file's shape and cannot be undone

**Where:** `src/lib/backup.ts:61-98`.
**What happens:** only `app` and `format` are checked. Types are not: `amount_cents`
arriving as `"12.50"` is inserted as a string into an INTEGER column, which SQLite
accepts. The restore runs in one transaction, so it is atomic — but it begins by
`DELETE FROM` every table, so a file that is valid JSON and wrong in content destroys
the existing ledger with nothing to roll back to.
**Proposed fix:** validate types and required fields before touching the database, and
copy the database file aside first so a wholesale rollback is possible.
**Test that would catch a regression:** the fixture set in the programme's B-09; each
must fail cleanly and leave the database byte-identical.

### F-06 · High · CSV export lets a merchant name become a formula

**Where:** `src/lib/backup.ts:145-148`. `quote()` implements RFC 4180 correctly and
stops there.
**What happens:** a description beginning `=`, `+`, `-` or `@` is a live formula when the
export is opened in Excel, LibreOffice or Sheets. Descriptions come from bank CSVs, so
the content is whatever a merchant put in a payment reference.
**Proposed fix:** prefix a leading `= + - @`, tab or CR with a single quote on export;
strip one leading `'` on import so a round-trip is lossless.
**Test that would catch a regression:** the `it.each` in the programme's B-08.

### F-07 · High · Signing secrets are exposed to five mutable third-party actions

**Where:** `.github/workflows/android.yml:28,30,38,155,163`, and `permissions:
contents: write` at line 20.
**What happens:** every action is referenced by a tag, which the publisher can move. A
compromised release of any of them runs inside a job holding all four signing secrets
and a `contents: write` token. The keystore is the one asset whose loss ends the app's
upgrade path for every user.
**Proposed fix:** pin all five to full commit SHAs; drop the top-level block to
`contents: read` and grant `write` only to the release step's job; put the signing
secrets behind a GitHub environment with required approval.
**Test that would catch a regression:** a CI check rejecting any `uses:` without a
40-character SHA.

### F-08 · Medium · Purged transactions remain in the file

**Where:** no `secure_delete`, no `VACUUM` after `purgeExpired` (`trash.ts:73`).
**What happens:** a row deleted, held 30 days and purged still sits in a free page. The
file never shrinks. Something deliberately deleted a year ago is recoverable from a hex
dump.
**Proposed fix:** `PRAGMA secure_delete = ON` on open, and `VACUUM` after a purge.

### F-09 · Medium · Soft-delete filtering is correct but unenforced

**Where:** every read in `db/repositories/`.
**What happens:** nothing today — I found no missed filter. But correctness rests on
each of ~30 queries remembering, and the count grows with every feature. The twelve
features added this session added roughly a dozen more.
**Proposed fix:** views (`v_transactions`) that pre-filter, with repositories reading
from them, plus a check that `FROM transactions` appears only in the view definition and
the trash screen.

### F-10 · Medium · Receipt photos sit outside anything the encryption will cover

**Where:** `src/lib/receipts.ts` — images in the app document directory, only the file
name in the database.
**What happens:** photographs of receipts are plaintext image files. SQLCipher will not
touch them, and they are excluded from the JSON backup, so they are neither protected
nor preserved.
**Proposed fix:** decide deliberately in Phase 1 — encrypt them individually with the
database key, or state plainly that they are not protected.

## New findings not anticipated by the programme

- **F-04** — restore-time SQL injection through column names. The programme's B-09
  anticipated *validation* problems but framed them as type confusion, not injection.
- **F-10** — receipts as an asset class outside the database. Added this session, so the
  programme could not have known.
- **`exportCsv` includes transfers.** Both halves of a transfer appear in the CSV, so a
  naive `SUM` of the Amount column in a spreadsheet still nets correctly, but a reader
  filtering to negatives will double-count spending. Not a bug exactly — a documentation
  gap in the export.

## Hypotheses that were wrong — delete these from the programme

- **H-04** — the lock does re-lock on background, with a grace period.
- **H-06** — no AsyncStorage, no SecureStore, nothing to audit.
- **H-08** — zero `console.*` in `src/`. The `no-console` rule in §4.6 is still worth
  adding as a ratchet, but there is nothing to clean up first.
- **H-11** — foreign keys are enforced.
- **H-15** — migrations are transactional, and `user_version` advances inside the
  transaction.
- **H-16** — a newer backup is already refused with a clear message.
- **H-19, H-21, H-22** — no secrets in history, nothing leaking in the agent or editor
  directories.
- **B-02** — the hash is SHA-256 via `expo-crypto`, not a 32-bit function. The collision
  sweep is unnecessary.
- **B-07** — IDs are `Crypto.randomUUID()`. `Math.random` appears nowhere in `src/db`.
- **B-04's date ambiguity** — `guessDateFormat` already reads the whole column rather
  than the first row, and `parseDate` already rejects the 31st of February. The
  remaining gap is the genuinely ambiguous file, where it defaults to `dmy` instead of
  asking.
- **B-10's double-posting** — `catchUpRecurring` is guarded by `last_applied_date` and
  bounded by `MAX_CATCH_UP`. Worth a test, not a fix.

## Open questions for the owner

1. **Receipts** (F-10): encrypt them alongside the database, or state that they are not
   protected? Encrypting means decrypting to display, which is work.
2. **F-03's fix changes stored hashes.** Existing rows keep their current fingerprints;
   only new imports use the ordinal. That means one statement re-imported across the
   change could duplicate. Accept that once, or migrate old hashes?
3. **`secure_delete`** (F-08) costs write throughput on every delete. Acceptable for a
   ledger this size, but it is your call.
4. **The programme's §4.7 proposes Vitest.** `CLAUDE.md` currently states no tests
   exist and that `typecheck` + `lint` are the only checks. Adding a runner changes that
   contract — confirm before I rewrite it.
