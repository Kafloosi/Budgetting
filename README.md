# Fare

A personal budgeting app for iOS and Android.

**Status:** v1 UI built on the data layer. Every core screen exists, the app runs
end to end, and it has not yet been near a store.

Fare draws a month of money as a metropolitan rail diagram fired in enamel: each
category is a route, its monthly limit is the end of the line, and spending is
how far along you have travelled. The visual system is recorded in `DESIGN.md`.

## Requirements

### Platforms

iPhone and Android, from a single codebase.

Development happens on Windows. Android can be built locally; **iOS cannot** —
Apple requires Xcode, which is macOS-only. The two ways around that:

- **EAS Build** — Expo's cloud service compiles the iOS binary on a hosted Mac.
- **A borrowed or rented Mac**, for the build-and-submit step only.

Day-to-day development and testing on a physical iPhone works fine from Windows
via the Expo Go app over Wi-Fi.

### Features

| Feature | Status |
| --- | --- |
| Manual entry (keypad, category, day, notes) | Built |
| Quick entries — saved one-tap amounts | Built |
| Budget limits, recurring or per-month | Built |
| Month forecast and plain-language insights | Built |
| Ledger with search, direction and line filters | Built |
| Recurring entries, caught up on open | Built |
| Savings goals with deadline suggestions | Built |
| Bank CSV import, bank-agnostic column mapping | Built |
| Stats — six months, or a full year by line | Built |
| Trash with 30-day recovery, undo on delete | Built |
| JSON backup and restore, CSV export | Built |
| App lock via the phone's own biometrics | Built |
| Budget alert notifications | Built |
| Receipt photos | Built |
| Statements opened straight from the banking app | Built |
| Cloud sync | Not started, by design |

### Data

Local-first: everything lives in SQLite on the device. No account, no network,
works offline.

Cloud sync and sharing a budget with family members are planned but not built.
That future is the reason for several schema decisions described below — the
seams exist now so adding sync later is not a migration nightmare.

## Stack

- **React Native 0.86** via **Expo SDK 57**, TypeScript
- **expo-router** for file-based navigation
- **expo-sqlite** for local storage
- **react-native-svg** for the route diagrams
- **react-native-reanimated** for the travelling markers
- **expo-document-picker** / **expo-file-system** for CSV import and backups
- **expo-local-authentication** for the optional app lock
- **Overpass** and **Overpass Mono**, self-hosted (SIL OFL, `assets/fonts/`)

## Project layout

```
src/
  app/                  expo-router screens
    (tabs)/             Month, Ledger, Budgets, Settings
    entry.tsx           the keypad sheet — the product's core path
    budget, category, goal, recurring-rule   modal editors
    categories, stats, goals, recurring, trash, backup, import
    welcome.tsx         first run
  components/
    transit/            the world: icons, roundel, route, month-line,
                        month-bars, keypad, tab-bar, forecast-panel
    …                   text, button, field, money, screen, sheet, and the rest
  constants/theme.ts    tokens: route colours, both appearances, type, motion
  providers/            settings, ledger invalidation, catch-up, undo, app lock
  db/
    types.ts            domain types
    migrations.ts       schema + migration runner (append-only)
    util.ts             ids, timestamps, transactions
    hash.ts             import fingerprinting, description normalising
    repositories/       the only place SQL lives
  lib/
    money.ts            cents <-> display strings, input parsing
    dates.ts            month and day maths
    csv.ts, backup.ts, forecast.ts, insights.ts, currencies.ts, haptics.ts
scripts/
  make-icons.mjs        the roundel, as app icon and splash
  make-textures.mjs     the two enamel surfaces
```

## Data model decisions

These were made up front because they are painful to retrofit once real data
exists on someone's phone.

**Money is integer cents, never floats.** `0.1 + 0.2 !== 0.3` is not acceptable
in a ledger. Conversion to and from display strings is confined to `lib/money.ts`.

**Amounts are signed** — expenses negative, income positive. Matches how banks
export CSV, and makes any total a plain `SUM`.

**UUID primary keys, not autoincrementing integers.** Two devices creating rows
offline must not collide. This is the single hardest thing to change later.

**Every table carries `created_at`, `updated_at`, `deleted_at`, `household_id`.**
`updated_at` gives a future sync layer its conflict-resolution key. Deletes are
soft, so a delete on one device propagates instead of being resurrected by the
other device's copy. `household_id` is always null today and is the seam for
sharing with family members.

**Imports are deduplicated by a content hash** of date + amount + normalised
description, enforced by a partial unique index. Re-importing an overlapping
statement is a no-op rather than a pile of duplicates.

**Budgets fall back from specific to recurring.** A budget row with a null
`month` is the recurring limit applied to every month; a `YYYY-MM` value
overrides just that month.

## Getting started

```bash
npm install
npm start          # then scan the QR code with Expo Go
npm run android    # or launch straight into an emulator
npm run typecheck
```

On a fresh clone, run `npm start` once before `npm run typecheck`. Expo generates
the git-ignored `expo-env.d.ts` on first start, and typechecking fails without it.

## Verifying a change

There is no test runner. `npm run typecheck`, `npm run lint`, and `npm run check`
(eight scripts under `scripts/`, one per invariant) are the checks, and the app
itself is the last one:

```bash
npm run typecheck
npm run lint
npm run check
npm start          # Expo Go on a phone, or npm run android / npm run web
```

The loop worth walking after any change to the ledger: first run → log an expense
on the keypad → it appears on Month and in the Ledger → put a limit on its
category → watch the route cross under, warning and over → import a CSV twice and
confirm the second import inserts nothing.

Then the automatic path: open a statement from the file manager and choose Fare.
A format it has seen before lands in the ledger with an undo bar and no mapping
screen; one it has not opens the import screen with the file already loaded.

## Installable builds

`.github/workflows/android.yml` builds a signed APK on GitHub's runners — pushing
a `v*` tag publishes it as a Release asset, and the workflow can also be run by
hand from the Actions tab. There is no iOS equivalent; that needs macOS or EAS.

It needs four repository secrets, set once:

| Secret | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the release keystore, base64-encoded (`PKCS12` is accepted as an older name for the same thing) |
| `ANDROID_KEYSTORE_PASSWORD` | its store password |
| `ANDROID_KEY_ALIAS` | the key alias inside it |
| `ANDROID_KEY_PASSWORD` | that key's password |

Generate the keystore once and never replace it:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore fare-release.p12 \
        -alias fare -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` ships with any JDK or JRE; on Windows it is under
`C:\Program Files\Java\<version>\bin\`. PKCS12 rather than the JKS default
because JKS is deprecated, and PKCS12 uses one password for both the store and
the key — so `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` hold the same
value.

Then encode it for `ANDROID_KEYSTORE_BASE64`. A `.p12` is binary, and the failure
mode if it is read as text is silent: the encoding succeeds, the secret looks
plausible, the workflow decodes it without complaint, and Gradle dies eighteen
minutes later on `Tag number over 30 is not supported`. Read the bytes.

```powershell
# Windows PowerShell 5.1 — -Encoding Byte is what keeps it binary
[Convert]::ToBase64String((Get-Content fare-release.p12 -Encoding Byte -Raw)) | Set-Clipboard
```

```powershell
# PowerShell 7+ renamed it; -Encoding Byte is gone
[Convert]::ToBase64String((Get-Content fare-release.p12 -AsByteStream -Raw)) | Set-Clipboard
```

```bash
# macOS and Linux
base64 -w0 fare-release.p12
```

Paste the whole single line into the secret. `certutil -encode` is not a
substitute — it wraps the output in `-----BEGIN CERTIFICATE-----` lines that are
not part of the data.

All four secrets must exist, and the names must match exactly — an unset secret
arrives at the workflow as an empty string rather than an error. From the CLI:

```bash
gh secret set ANDROID_KEYSTORE_BASE64 < keystore.b64.txt   # or leave it as PKCS12
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```

For a PKCS12 keystore the store and key passwords are one value, so
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` get the same thing. The
alias is whatever `-alias` said when the keystore was generated — `fare` if the
command above was used verbatim.

`gh secret list` shows what is set, never the values. If any are missing or
wrong, the workflow now says which ones in its first two minutes, in the
"Restore the signing keystore" step, rather than after a full Gradle build.

Keep the `.p12` outside the repository and backed up. Android will not install an
APK over one signed with a different key — the only way through is an uninstall,
and an uninstall deletes the SQLite database, which is the entire ledger. For the
same reason `android.package` is pinned in `app.json` and must not change.

Bump `android.versionCode` for each release you intend to install over an earlier
one. Reinstalling at the same code is fine; only downgrades are refused.

## Next steps

1. Encrypted export, then SQLCipher with a device-bound key (`AUDIT.md`, F-01).
2. Share-sheet delivery on Android — `ACTION_SEND` needs a native shim that
   `expo-linking` does not provide.
3. Tapping the import reminder notification should open the import screen —
   today it doesn't, because nothing in the app listens for a notification
   response. The notification still does its job of telling you; it just
   can't take you anywhere yet.
4. Per-bank CSV presets shipped by default, rather than learned on first import.
5. Store identity: screenshots, listing copy, and an EAS build for iOS.
