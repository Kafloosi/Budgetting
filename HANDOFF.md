# Handoff

Updated: 2026-08-08 · version 0.2.1.3 · `worktree-automated-csv-import`

## Read this first

**The work is not on `main`.** This session ran entirely in a worktree and pushed
its branch. `main` is still at `34fcc1f` (0.1.13.4). Fourteen commits sit on
`worktree-automated-csv-import`, pushed to origin. Nothing has been merged, and
that was deliberate — merge it when you are ready, not because it is sitting
there.

**`v0.2.1.2` was tagged and a build was triggered.** It is the first release since
`v0.1.6.1`, and `android.versionCode` is `4`, so it installs over the old one and
keeps the ledger. Two things to check rather than assume:

- The workflow's `release` job had **never run before this tag**. Its parsing and
  its tag gate were verified, but `download-artifact` handing the file to
  `action-gh-release` was unproven. This tag is the first real test of it. If the
  Release exists with `app-release.apk` attached, that question is finally closed.
- **The build was published without the device walkthrough having been run.** That
  was a deliberate choice, made with the trade-off stated. See below.

**`gh` is not installed on this machine.** Workflow runs have to be checked in the
browser.

**The local `node_modules` in the main checkout is stale.** `expo-notifications`
and `expo-image-picker` are in `package.json` but were never installed there, so
`npm run typecheck` fails in `2026/Budgetting` with two `TS2307`s. `npm install`
fixes it. The worktree has its own, complete.

## What shipped: statements arrive by themselves

A bank CSV opened from another app — *Open with*, or tapping its download
notification — is handled by Fare. If the bank's column layout has been seen
before, the statement lands in the ledger, categorised by import rules and
deduplicated by content hash, with an undo bar for five seconds. A layout it has
not seen opens the existing import screen with the file already loaded; saving the
format there is what makes every later statement from that bank automatic.

Plus an optional reminder, off by default, when nothing has been imported for
fourteen days. At most one per quiet spell — it re-arms when a statement lands.

No migration. No new dependency. No network call: `src/` still contains no `fetch`.

## Why this instead of a bank connection

The feature asked for was "let people connect their bank account, read-only,
continuously updated". It was designed away, and the reasoning is recorded in
`docs/superpowers/specs/2026-08-07-automated-csv-import-design.md` because it will
be raised again.

PSD2 means an aggregator. Every aggregator issues a secret that cannot ship in an
APK — it is extractable, and embedding it breaches their terms, which takes every
connected user down at once. So the secret needs a server, and a server that can
reach bank data is a server that sees bank data. That makes you a GDPR controller:
a DPIA, a processing agreement, a seventy-two hour breach duty, and a central
store of other people's financial history.

What that buys is freshness, and only freshness. The pipeline it would feed was
already built and already good. What was missing was not intelligence — it was
that the file had to be fetched by hand. So this session shipped the delivery.

If real users ask for zero-touch, the decision is worth reopening with that demand
as evidence. It would feed this same pipeline.

## What has never been run

This is the most important section.

The machine that built this has **no Android SDK**, so every native path was
typechecked, reviewed, and never once executed:

- whether the intent filter fires, and what `useLinkingURL()` actually hands back
- whether `new File(content://…)` reports `exists`, `size` and `text()`
- whether the ids from `bulkInsertImported` are the rows undo removes
- whether the app lock genuinely holds a file back
- whether the reminder is ever delivered

`docs/superpowers/plans/2026-08-08-device-walkthrough.md` is the checklist,
ordered by where a defect is most likely and most expensive. Start with a real
Android share and watch what the import screen calls the file.

**Take that risk seriously.** Three defects survived seven individually-clean task
reviews and were caught only by the whole-branch review, and all three lived in
exactly this unexercised space:

- the launch-URL filter was a **denylist**, so every non-`fare://` scheme was
  treated as a file — an error on every Expo Go launch
- `invalid` was computed and thrown away, so a bank changing its date format while
  keeping its headings would report "nothing new" while silently discarding a
  month of spending
- `File.name` is a URI basename, not a display name, so on Android a statement
  would have been shown as `msf%3A1000000123`

The review that found them is worth more than the reviews that did not.

## What was accepted rather than fixed

- **The Android share sheet does not work.** Only `ACTION_VIEW`. `expo-linking` in
  SDK 57 cannot read `Intent.EXTRA_STREAM`, where `ACTION_SEND` puts the URI.
  Supporting it needs a native shim or a dependency.
- **The reminder cannot be tapped through.** No notification-response listener
  exists in the app; building one is its own work.
- **The 10 MB cap may not hold on Android.** `size` returns 0 when a content
  provider does not report one, and 0 passes the cap.
- A re-lock during the write leaves the rows imported correctly but with no undo
  bar — its provider is unmounted at that moment.
- A Storage Access Framework URI still displays as `primary:Download/statement.csv`
  rather than a clean filename.

## Next

1. **Walk the device checklist** against the `v0.2.1.2` APK. Everything else is
   downstream of finding out whether this works.
2. **File the app-lock bug.** `src/providers/settings.tsx:30` — `loadSettings(db)`
   has no `.catch()`. A rejected read pins `loading` true forever, and
   `AppLockGate` renders its children while `loading` is true, so the app stays
   **permanently unlocked**. Pre-existing, untouched by this branch, and a
   security bug rather than an import one.
3. **Merge to `main`** once the walkthrough passes.
4. Then the security programme, in `AUDIT.md`'s order, which has not moved:
   encrypted export first and verified on a second device, then SQLCipher with a
   device-bound key, then `allowBackup: false`. Reversing that order ships a
   data-loss bug.

## Traps

- **`npm run check` before every commit.** Eight files now, 148 assertions.
  `typecheck` does not read SQL strings and `lint` does not run them.
- **`src/lib/import-run.ts` and `src/lib/import-nudge.ts` must import nothing
  native.** They are executed under Node by the check scripts. That is why the
  digest and the rule matcher arrive as arguments. The same division as
  `lib/fingerprint.ts` against `db/hash.ts`.
- **`src/providers/incoming.tsx` survived two rounds of race fixes.** Its
  dependency-identity assumption is load-bearing and now commented: a refactor
  dropping the `useCallback` from `useUndo`'s `offer` or from
  `useInvalidateLedger` reintroduces mid-flight releases with no signal.
- **A soft-deleted row does not block a re-import.** The unique index is
  `WHERE import_hash IS NOT NULL AND deleted_at IS NULL`. So undo, re-share,
  re-import, then restoring the trashed row raises `SQLITE_CONSTRAINT`.
- **`android/` and `ios/` are gitignored.** The CSV registration in `app.json` is
  the only copy; `check-app-config.mjs` guards it.
- **`nth === 0` in `lib/fingerprint.ts` is still load-bearing.** Change that string
  and every stored import hash stops matching.
- **PowerShell 5.1 `Get-Content -Raw`** double-encodes em dashes. Use
  `[System.IO.File]::ReadAllText`/`WriteAllText`.
- **`git show branch:path` in Git Bash** gets mangled. Prefix `MSYS_NO_PATHCONV=1`.

## Open decisions

- Whether to support the Android share sheet, which means accepting a dependency
  in a project whose pitch is that it asks for nothing.
- Vitest, or leave the checks as they are. Unchanged from last session; the checks
  have since grown to eight files and 148 assertions, which strengthens the case
  for leaving them alone.
- The signing secrets are still not behind a GitHub environment with required
  reviewers.
- `PRODUCT.md`'s "Capabilities and Constraints" is still a fossil — it claims no
  screens exist and `src/app/` is the Expo template. There are 21 files there.
