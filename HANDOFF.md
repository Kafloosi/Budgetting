# Handoff

Updated: 2026-08-05 · version 0.1.2.11

## Read this first

**The Android build works.** A signed APK now builds end to end:
https://github.com/Kafloosi/Budgetting/actions/runs/31027616779 — `BUILD
SUCCESSFUL in 23m 29s`, JS bundle verified inside, 54.1 MB artifact.

**Nothing is merged.** Two open draft PRs, neither on `main`:

| PR | Branch | Into | What |
| --- | --- | --- | --- |
| [#2](https://github.com/Kafloosi/Budgetting/pull/2) | `fix-apk-signing` | `worktree-android-release-build` | the build fix, `0.1.2.11` |
| [#1](https://github.com/Kafloosi/Budgetting/pull/1) | `audit-fixes` | `main` | CSV import bugs, `0.1.1.6` |

`main` is still at `351ac17` (`0.1.1.5`) and has no `.github/` at all.

## Where we left off

### 1. The APK build — fixed

The previous handoff said "the four repository secrets are set and confirmed
working". **They were not.** `gh secret list` returned exactly one secret,
`PKCS12`. That single wrong sentence is why the failure looked like a keystore
problem for a whole session.

Two faults, both invisible until Gradle's last task:

- Three of the four secrets did not exist. An unset secret arrives as an empty
  string, not an error, so `echo "" | base64 -d` wrote a zero-byte file and the
  build spent 17m48s getting to it before dying on `Tag number over 30 is not
  supported` — an ASN.1 parse error on nothing.
- The `PKCS12` secret was not valid base64 at all. The local
  `C:\Users\luuks\fare-release.b64` is perfect and decodes byte-identical to the
  `.p12`, so the value was damaged on its way *into* GitHub.

What changed in `.github/workflows/android.yml`:

- The restore step decodes and inspects the keystore **before** looking at
  credentials, so a half-configured repo still learns whether its keystore is
  sound. In order: missing keystore secret → won't base64-decode → no DER
  `SEQUENCE` header → missing password/alias → `keytool -list` rejects it. Two
  seconds, and the message names which.
- `PKCS12` is read as a fallback for `ANDROID_KEYSTORE_BASE64`. Secrets cannot be
  renamed, only recreated, and re-pasting a release keystore to relabel it is a
  good way to lose one.
- `checkout@v7`, `setup-node@v7`, `setup-java@v5` — clears the Node 20
  deprecation warnings. `java-version: 17` unchanged; the action major and the
  JDK it installs are separate things.
- `README.md` now documents the base64 encoding it never did. A `.p12` is binary
  and reading it as text corrupts it silently.

All four secrets are set and **verified by a green build**, not by assumption.

### 2. CSV import bugs — PR #1, against `main`

Found by auditing the repo against its own `CLAUDE.md` rules.

- `parseMoneyToCents('1.234')` returned €1.23, not €1234. "Last separator wins"
  is right for `1.234,56` and wrong for a lone group, which is how Dutch exports
  write plain thousands. `1.234.567` was worse — it reached `Number()` intact,
  came back `NaN`, and the row was dropped silently.
- `parseDate` accepted `31-02-2026` and stored it verbatim.
- `guessDateFormat` ended `if (first > 12) return 'dmy'; return 'dmy';` — `mdy`
  unreachable, and only the first row was ever read.
- The 11 `no-unused-expressions` warnings are gone. Lint is clean.

Note this PR is cut from `main`, which predates the `lib/dates.ts` / `db/hash.ts`
restructure on the release branch. Expect to reconcile.

### 3. Tooling

`gh` CLI 2.97.0 installed at `C:\Program Files\GitHub CLI\gh.exe`, authenticated
as `Kafloosi` (scopes `gist`, `read:org`, `repo`). Existing shells need a restart
to get it on `PATH`. Reading Actions logs is what unblocked this session — the
previous one guessed at the failure because it could not.

## In flight

Nothing half-applied. Both PRs are complete and verified; neither is merged.

## Next

1. **Merge PR #2**, then decide how `worktree-android-release-build` reaches
   `main`. `workflow_dispatch` only appears in the Actions tab for workflows
   already on the default branch — until the workflow is on `main`, dispatching
   needs `gh workflow run --ref <branch>`.
2. **Reconcile the version lines.** This branch is `0.1.2.11`; PR #1 takes `main`
   to `0.1.1.6`. They will conflict on `package.json` and `app.json`.
3. **Security tidy-up**, none of it blocking:
   - Delete the `PKCS12` secret — it holds an unusable value and is shadowed.
   - Delete `C:\Users\luuks\fare-release.b64`; it is a second copy of the private
     key in a trivially decodable form.
   - `fare-release-SECRETS.txt` keeps the password in plaintext beside the `.p12`.
     Move both into a password manager.
   - Rotate the store password — `keytool -storepasswd` changes the password, not
     the key, so signed APKs stay installable.
   - Enable **Google Play App Signing** when publishing. Play holds the app
     signing key and you keep a replaceable upload key, so losing the keystore
     stops being a catastrophe that costs users their ledger.
4. **Restructure Move 2 (`0.1.2.12`)** — extract `src/components/plate.tsx`. The
   same selectable control exists nine times: `DirectionPlate` (`app/entry.tsx`),
   `SpanPlate` (`app/stats.tsx`), `KindPlate` (`app/category.tsx`), `ScopePlate`
   (`app/budget.tsx`), `Plate` (`app/recurring-rule.tsx`), `Chip`
   (`app/import.tsx`), `FilterChip` (`app/(tabs)/ledger.tsx`), `Chip`
   (`components/day-picker.tsx`) and inline plates in settings. The first three
   are identical apart from their names. Do **not** absorb the `CurrencyPicker`
   option row — different control.
5. **Restructure Move 3** — move `toDraft` and `Mapping` out of the 419-line
   `app/import.tsx` into `lib/csv.ts`.
6. **Import triage + routing rules** — planned in
   `C:\Users\luuks\.claude\plans\features-you-recommend-jiggly-matsumoto.md`,
   sequenced after the restructure so its two new screens use the extracted plate.
   `import_rules` ships in migration 0 with no repository and no UI, and
   `app/import.tsx:113` still inserts every row with `category_id: null`.

## Traps

- **Do not record a secret as "set and confirmed" without checking.** `gh secret
  list` takes a second and names them. This cost a session.
- **PowerShell 5.1 `Get-Content -Raw` reads BOM-less UTF-8 as ANSI.** Writing it
  back double-encodes every em dash into `â€”`. Use
  `[System.IO.File]::ReadAllText` / `WriteAllText` with `UTF8Encoding($false)`.
  `Set-Content -Encoding utf8` adds a BOM, which the linter flags.
- **Encoding a `.p12` for a secret**: PowerShell 5.1 needs `-Encoding Byte`,
  PowerShell 7 needs `-AsByteStream`, elsewhere `base64 -w0`. `certutil -encode`
  wraps the data in PEM lines and is not a substitute.
- **A fresh clone has no `expo-env.d.ts`**, and `npm run typecheck` fails on
  `@/global.css` without it. Run `npm start` once, or write
  `/// <reference types="expo/types" />` into it by hand.
- **Git Bash mangles `git show branch:path`** — colons and slashes get rewritten.
  Prefix with `MSYS_NO_PATHCONV=1`.
- Bumping the version has only ever touched `package.json` and `app.json`, so
  `package-lock.json` drifted to `0.1.0.0`. PR #1 resyncs it on the `main` line;
  this branch still carries the stale value. `npm ci` does not care.

## Open decisions

- App name for the stores. `PRODUCT.md` says undecided; `app.json` says "Fare".
  The Android package commits to `com.kafloosi.fare` regardless.
- **EAS vs the current build.** Asked and answered this session: not worth
  switching for security — EAS means trusting Expo *in addition to* GitHub, and
  it holds the signing key by default. Switch only for iOS, which this setup can
  never do from Windows.
- Multi-currency — the schema carries `currency` per account, nothing decides
  whether the product supports more than one.
- Whether accounts are surfaced to the user at all.
- `PRODUCT.md`'s "Capabilities and Constraints" is stale: it says no screens are
  built. Every screen has existed since v1.
