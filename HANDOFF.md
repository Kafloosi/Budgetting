# Handoff

Updated: 2026-08-07 · version 0.1.13.3 · `main` at 24e6135

## Read this first

**Your local checkout is behind.** This session worked in a git worktree and pushed
everything to `main`; the primary checkout was never fast-forwarded. Run `git pull` in
`2026/Budgetting` before anything else. The worktree at
`.claude/worktrees/release-0.1.3.0` on branch `worktree-release-0.1.3.0` is fully
contained in `main` and can be removed.

**Two releases have shipped**, both signed, both verified:

- `v0.1.3.0` — the first installable Fare
- `v0.1.6.1` — versionCode 3, installs over it and keeps the ledger

**`npm run check` exists now.** Six files, 116 assertions, on Node alone with no
dependency and no test runner. Run it with `typecheck` and `lint` before every commit.
`CLAUDE.md`'s old "no tests exist" line is gone.

## Where we left off

Forty commits. Three things happened, in this order.

### 1. Twelve features, 0.1.3.1 → 0.1.12.0

Every one verified against a real SQLite database via `node:sqlite` before shipping.

| Version | What |
| --- | --- |
| `0.1.3.1` | One `components/plate.tsx` replacing nine copies, −400 lines |
| `0.1.3.2` | `Mapping`/`Draft`/`toDraft` into `lib/csv.ts` |
| `0.1.4.0` | Import rules, rule editor, triage queue |
| `0.1.5.0` | Statement formats recognised by header signature (migration 6) |
| `0.1.6.0` | Rollover budgets (migration 7) |
| `0.1.7.0` | Budget alerts at 80% and over |
| `0.1.8.0` | Accounts surfaced and backfilled (migration 8) |
| `0.1.9.0` | Transfers (migration 9) |
| `0.1.10.0` | Splits (migration 10) |
| `0.1.11.0` | Receipt photos (migration 11) |
| `0.1.12.0` | Saved filters (migration 12), Android quick-add shortcut |

**Testing changed three designs rather than confirming them.** Worth knowing, because
the reasoning is not visible in the final code:

- Rollover would have credited €1800 the moment you enabled it, from eight quiet months
  nobody was budgeting against. Hence `rollover_since` — counting starts when the switch
  is flipped.
- Migration 8 first skipped trashed rows, so restoring from trash would have produced a
  transaction with no account: the one state the rest of the app now assumes impossible.
- The transfer guard is proven load-bearing — without it income reads 50000 instead of
  30000 in `check-ledger`.

### 2. Security audit — `AUDIT.md`

Phase 0 of the programme, read-only, all 22 hypotheses adjudicated with `file:line`
evidence. **Eleven are refuted** and that is the useful half: no `console.*` anywhere,
foreign keys enforced, transactional migrations, CSPRNG UUIDs, SHA-256 fingerprints, a
newer backup already refused, nothing leaking in git history or the agent directories.
Delete those from the programme.

### 3. Nine of ten findings fixed, 0.1.12.2 → 0.1.13.3

- **F-03** (Critical) — two identical coffees on one day were one coffee. Fingerprints
  now carry an occurrence ordinal. `nth === 0` produces the pre-ordinal string byte for
  byte, so **no migration was needed** and re-importing an old statement finally lands
  the duplicate it wrongly dropped.
- **F-02** — corrected before it could be fixed, and the correction matters. The
  programme blamed a float rounding `1.005` to 100 cents; measured, the float mis-parses
  **none** of 200,000 two-decimal values, and `1.005` is deliberately €1005 because a
  lone group of three is Dutch thousands. The real defect was `12,34-` — trailing minus,
  a common Dutch and German export format — parsing as **positive**, filing every
  expense in the file as income.
- **F-04** — `restoreBackup` built its `INSERT` from column names in the JSON. A crafted
  backup was arbitrary SQL. Now an explicit allowlist.
- **F-05** (partly) — validation runs in full before a row is deleted. Still outstanding:
  the database file is not copied aside first.
- **F-06** — `csvCell` neutralises leading `= + - @` so a merchant name cannot become a
  live formula in the user's spreadsheet.
- **F-07** — six actions pinned to commit SHAs, `contents: read` by default, publishing
  isolated in a `release` job that runs no repository code.
- **F-08** — `secure_delete = ON` and `VACUUM` after a purge.

## In flight

Nothing half-applied. Every commit is pushed and every check passes.

## Next

**Phase 1, and the order is not negotiable** — reversing it ships a data-loss bug to
real people:

1. **Encrypted export**, and it has to be genuinely good: `@noble/ciphers` +
   `@noble/hashes` (both named in the approved plan), AES-256-GCM, Argon2id with the
   parameters stored in the file, verify-on-write by decrypting what was just produced
   before claiming success. **Receipts go inside**, base64 within the ciphertext — a
   decision taken this session, and the cost is real: a small export becomes tens of
   megabytes with Argon2id over all of it, so it needs progress feedback, not a spinner.
2. **The backup nag** — "last backed up N days ago" in Settings plus a first-run
   explanation. Load-bearing, not decoration: after step 3 this export is the only way
   to move phones.
3. **SQLCipher**, device-bound key via `SecureStore` with
   `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and `requireAuthentication`. This is what turns the
   app lock from a UI gate into a real control. **Expo Go stops working** from here —
   set up a dev build first, and expect `npm run android` to become `expo run:android`
   (prebuild tries to make that change already; it was reverted deliberately in
   0.1.12.0 because it was premature).
4. **`allowBackup: false`** and the iOS exclusion. Mostly belt-and-braces once 3 is
   done, since an encrypted database restored onto a new phone is inert.

Then the rest of `AUDIT.md`: F-09 (soft-delete views), and F-05's file copy alongside
step 1 where it has a second purpose.

## Traps

- **`npm run check` before every commit.** `typecheck` does not read SQL strings and
  `lint` does not run them.
- **`check:migrations --update` after appending a migration**, once it is final. It
  refuses an edit to a shipped one, which is the only irreversible rule in the repo.
- **Never a float in money parsing**, not even briefly. `1.234` is Dutch thousands —
  `check-money` will fail anyone who "fixes" that.
- **`nth === 0` in `lib/fingerprint.ts` is load-bearing.** Change that string and every
  stored import hash stops matching.
- **`transfer_group_id IS NULL` belongs on every spend or income aggregate.** Use
  `notATransfer()` so a grep finds them all.
- **Git hands `.github/workflows/android.yml` back as CRLF**, which defeats anchored
  regexes. `check-workflow` normalises first.
- **`.expo/types/router.d.ts` corrupts** if Metro is killed mid-write. Delete it; it is
  generated and gitignored.
- **PowerShell 5.1 `Get-Content -Raw`** reads BOM-less UTF-8 as ANSI and double-encodes
  em dashes. Use `[System.IO.File]::ReadAllText`/`WriteAllText`.
- **`git show branch:path` in Git Bash** gets mangled. Prefix `MSYS_NO_PATHCONV=1`.
- **`gh run watch --exit-status` can exit 1 on a network blip** while the run succeeded.
  Check the run's own conclusion before reporting a failure.
- The APK is **116 MB** because it is universal, carrying four ABIs. A per-ABI split or
  an AAB would cut it to roughly a quarter.

## Open decisions

- **Vitest, or leave the checks as they are.** `scripts/check-*.mjs` already covers what
  §4.7 proposed. A runner buys watch mode and a familiar shape; it also adds a dependency
  to a project whose pitch is that it asks for nothing.
- **The signing secrets are not behind a GitHub environment** with required reviewers.
  Settings-UI work, not a commit.
- **The `release` job's two steps have never run.** It parses and its tag gate is
  verified, but `download-artifact` placing the file where `action-gh-release` expects it
  is unproven until the next real tag.
- **`android.versionCode` is 3.** Bump it on any commit meant to install over v0.1.6.1.
- Multi-currency: `accounts.currency` is per-row, nothing converts, mixed totals are not
  attempted.
- `PRODUCT.md`'s "Capabilities and Constraints" is still stale — it says no screens are
  built.
