# Handoff

Updated: 2026-08-05 · version 0.1.2.6

## Read this first

**Nothing from this session is on `main`.** Eight commits sit on
`worktree-android-release-build`; `main` is still at `351ac17`. Open the PR before
anything else:

https://github.com/Kafloosi/Budgetting/pull/new/worktree-android-release-build

## Where we left off

Three strands, in the order they happened.

### 1. A downloadable Android build — started, **not working**

There was nothing installable anywhere: no releases, no CI, no `eas.json`. Now
`.github/workflows/android.yml` builds a signed APK on `workflow_dispatch` and on
any `v*` tag, publishing it as a Release asset.

- `app.json` gained `android.package = com.kafloosi.fare` and `versionCode: 1`.
  **Neither may change once anything is installed** — Android treats a different
  package or signing key as a different app, and the only way through is an
  uninstall, which deletes the SQLite database.
- The keystore is `C:\Users\luuks\fare-release.p12` (PKCS12, alias `fare`, valid
  to 2053). Its password and the four GitHub secret values are in
  `C:\Users\luuks\fare-release-SECRETS.txt`. **Back both up off the machine.**
- The four repository secrets are set and confirmed working.
- Tag `v0.1.2.2` was pushed and triggered a run.

**The run failed.** https://github.com/Kafloosi/Budgetting/actions/runs/30983523792

It got through checkout, Node 22, JDK 17, `npm ci`, `expo prebuild` and the
keystore restore, then failed on **Assemble the release APK**. No Release exists.

The log could not be read from here — GitHub requires authentication for the
Actions logs API even on a public repo, and there is no `gh` CLI or token on this
machine. JDK 17 and Node 22 were checked against the Expo SDK 57 docs and are
correct, so the versions are not the cause. Untested guesses, in order: Gradle
heap exhaustion, or Android SDK platform 36 missing on the runner.

**Next step: read the failing step's log and fix the real cause.** Each attempt
costs roughly twenty minutes, so guessing is expensive.

### 2. `CLAUDE.md` gained three standing rules

- **Session start** — open with ten ranked things worth doing, drawn from the repo
  rather than from memory, mixed in scale, never padded to reach ten.
- **After every change** — commit and push without asking, version bumped in
  *both* `package.json` and `app.json` in the same commit.
- **Tidy-up pass** — after a feature, one behaviour-preserving structural pass
  scoped to what the feature touched.

The version rule is written down because it was got wrong twice in this session:
a commit subject naming a version the files did not carry.

### 3. Restructure — Move 1 of 3 done

Plan: `C:\Users\luuks\.claude\plans\features-you-recommend-jiggly-matsumoto.md`

Done, in `7ad19fc`:

- `src/lib/dates.ts` — all calendar maths. `db/util.ts` had sixteen importers and
  only two wanted anything database-shaped.
- `src/db/hash.ts` — `importHash` plus `normaliseDescription`. This makes the
  comment at `db/types.ts:76` true; it had always documented `importHash` as
  living in `./hash`.
- `db/util.ts` keeps `withTransaction`, `newId`, `nowIso`.

## In flight

Nothing half-applied. Move 1 is complete and verified; Moves 2 and 3 have not been
started.

## Next

1. **Fix the Android build.** Read the log, fix, re-tag. Until this works there is
   still no way to install Fare on a phone.
2. **Merge the branch.** Note also that `workflow_dispatch` only appears in the
   Actions tab for workflows already on the default branch.
3. **Restructure Move 2 (`0.1.2.7`)** — extract `src/components/plate.tsx`. The
   same selectable control exists nine times: `DirectionPlate` (`app/entry.tsx`),
   `SpanPlate` (`app/stats.tsx`), `KindPlate` (`app/category.tsx`), `ScopePlate`
   (`app/budget.tsx`), `Plate` (`app/recurring-rule.tsx`), `Chip` (`app/import.tsx`),
   `FilterChip` (`app/(tabs)/ledger.tsx`), `Chip` (`components/day-picker.tsx`) and
   inline plates in settings. The first three are identical apart from their names.
   Do **not** absorb the `CurrencyPicker` option row — different control.
4. **Restructure Move 3 (`0.1.2.8`)** — move `toDraft` and `Mapping` out of the
   419-line `app/import.tsx` into `lib/csv.ts`.
5. **Import triage + routing rules** — planned in full in the same plan file, and
   deliberately sequenced after the restructure so its two new screens are built on
   the extracted plate rather than adding a tenth and eleventh copy. `import_rules`
   ships in migration 0 with no repository and no UI, and `app/import.tsx:113` still
   inserts every row with `category_id: null`.

## Traps

- **PowerShell 5.1 `Get-Content -Raw` reads BOM-less UTF-8 as ANSI.** Writing it
  back double-encodes every em dash into `â€”`. It corrupted twenty files here
  before being caught in the diff and reverted. Use
  `[System.IO.File]::ReadAllText` / `WriteAllText` with `UTF8Encoding($false)`.
  `Set-Content -Encoding utf8` also adds a BOM, which the linter flags.
- **A fresh clone has no `expo-env.d.ts`**, and `npm run typecheck` fails on
  `@/global.css` without it. Run `npm start` once, or copy the file across.
- The 11 `no-unused-expressions` lint warnings in `db/repositories/transactions.ts`
  are pre-existing and unrelated.

## Open decisions

- App name for the stores. `PRODUCT.md` says undecided; `app.json` says "Fare".
  The Android package now commits to `com.kafloosi.fare` regardless.
- Multi-currency — the schema carries `currency` per account, nothing decides
  whether the product supports more than one.
- Whether accounts are surfaced to the user at all.
- `PRODUCT.md`'s "Capabilities and Constraints" is stale: it says no screens are
  built. Every screen has existed since v1.
