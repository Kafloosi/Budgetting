# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Both iOS and Android ship from one Expo/React Native codebase, but the product
uses **one shared design language on both**, not a per-OS split. Native
affordances (back gestures, system nav, keyboard, safe areas, haptics, dynamic
type) are respected on each OS; the visual world does not fork into HIG on one
and Material on the other.

## Users

General public — anyone tracking personal spending on their own phone. This is
intended for strangers to download from the App Store and Play Store, not a
private tool. That makes first-run, empty states, and store presentation real
design obligations rather than afterthoughts.

The primary situation: someone standing at a checkout or sitting down at the end
of a week, entering what they spent and checking whether they are still inside
their limit for the month.

## Product Purpose

A local-first personal budgeting app. Record expenses and income, set per-category
monthly limits, import bank statements, and see whether spending is on track.

Success is a user who keeps entering transactions after week two — the app has to
make logging fast enough to survive daily use, and make the answer to "can I
afford this?" visible in one glance.

## Positioning

Everything lives in SQLite on the device. No account, no signup, no server, no
network required. A budgeting app that never asks who you are and never uploads
your transactions is meaningfully different from the bank-linking incumbents.

## Operating Context

- Entry happens in seconds, often one-handed, often immediately after a purchase.
- Review happens per calendar month; the month is the unit of the whole product.
- Bank CSV export is the bulk-entry path: the user downloads a statement from
  their bank's site and imports the file.
- Offline is not an edge case; it is the normal state.

## Capabilities and Constraints

Built (data layer only, no UI yet):

- Manual transactions with category, account, date, description, notes.
- Categories (expense/income) with colour, emoji icon, sort order, archiving.
- Budgets per category, with a recurring limit and per-month overrides.
- Bank CSV import with content-hash dedupe and bulk insert.
- Import rules mapping bank descriptions onto categories.

Not built:

- Every screen. `src/app/` and `src/components/` are still the Expo template.
- CSV parsing for specific bank formats (ING, Rabobank, ABN are the intended
  first targets), and the import UI.
- Charts and reports (`react-native-svg` installed, unused).
- Cloud sync.

Hard technical constraints:

- Money is integer cents everywhere; display conversion lives only in
  `src/lib/money.ts`. Amounts are signed — expenses negative, income positive.
- UUID primary keys; soft deletes; every row carries `created_at`, `updated_at`,
  `deleted_at`, `household_id`.
- Migrations in `src/db/migrations.ts` are append-only. SQL lives only in
  `src/db/repositories/`.
- Development is on Windows. Android builds locally; iOS binaries require EAS
  Build or a borrowed Mac. Day-to-day iOS testing is Expo Go on a physical
  iPhone.
- Expo SDK 57 / React Native 0.86 / React 19.2, expo-router for navigation.

Explicitly undecided:

- App name (repo is "Budgetting"), icon, and store identity.
- Multi-currency. Data model carries a `currency` field per account; whether the
  product supports more than one is not decided.
- Whether accounts are surfaced to the user at all in v1.

## Brand Commitments

None established. No name, logo, voice, or visual identity is committed yet.

## Evidence on Hand

None. There are no users, testimonials, screenshots, case studies, benchmarks,
or press. Category seed data (`seed-groceries` and friends) exists in migration 0
and is the only real content in the project.

Future design work must not invent balances, sample transactions, user counts,
reviews, or "trusted by" claims and present them as real.

## Product Principles

1. **Logging must be faster than not logging.** The entry path is the product;
   everything else is downstream of whether it stays in daily habit.
2. **The month is the frame.** Budgets, progress, and review are all per calendar
   month. Design decisions should make the current month's state instantly legible.
3. **Privacy without ceremony.** No account, no network — and no screens
   explaining that, either. It should simply never ask.
4. **Never fabricate money.** Empty is empty. No placeholder balances, no demo
   transactions dressed as real data.
5. **Household sharing is a future, not a feature.** `household_id` is a schema
   seam only. Do not design sharing, invites, or multi-user UI as if it ships.

## Accessibility & Inclusion

No product-specific standard established beyond platform defaults. Given the
one-handed, at-the-checkout usage scene, respecting dynamic type and touch target
minimums on both OSes is a practical requirement, not a formal commitment.
