# Budgetting

A personal budgeting app for iOS and Android.

**Status:** foundation only. The project scaffold and data layer are in place; no
app screens have been built yet.

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
| Manual expense tracking | Data layer done, no UI |
| Budget limits + alerts | Data layer done, no UI |
| Bank CSV import | Dedupe + bulk insert done; parsing and UI not started |
| Charts and reports | Not started |

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
- **react-native-svg** for charts (installed, unused so far)
- **expo-document-picker** / **expo-file-system** for CSV import

## Project layout

```
src/
  app/          expo-router screens (still the template's)
  components/   shared UI (still the template's)
  constants/    theme tokens
  db/
    types.ts            domain types
    migrations.ts       schema + migration runner
    util.ts             ids, timestamps, month maths, import hashing
    repositories/       the only place SQL lives
      categories.ts
      transactions.ts
      budgets.ts
  lib/
    money.ts            cents <-> display strings, input parsing
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

## Next steps

1. Wrap the app in `<SQLiteProvider databaseName="budget.db" onInit={migrateDatabase}>`
   in `src/app/_layout.tsx` — the data layer is written but not yet mounted.
2. Build the transaction list and entry screens.
3. Build the budgets screen on top of `getBudgetProgress`.
4. CSV parsing for Dutch bank formats (ING, Rabobank, ABN), then the import UI.
5. Charts.
