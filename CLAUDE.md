@AGENTS.md

# Fare

Read first: `HANDOFF.md` · `DESIGN.md` · `PRODUCT.md` · `README.md`

## Session start

Ten things worth doing next. Before the greeting, before any question back.

- Read `HANDOFF.md` and the `README.md` feature table first.
- Ten lines, ranked, best first. One line each: what it is, why it is worth doing.
- Mix scales: features, gaps, bugs, papercuts, store readiness.
- Prefer what the code proves over ideas.
- Never invent work to reach ten. Say so and stop short.
- Then wait.

## Commands

```bash
npm start          # dev server
npm run android    # emulator
npm run web
npm run typecheck
npm run lint
npm run check              # money, dedupe, schema, ledger arithmetic
```

- No test runner. `typecheck`, `lint` and `check` are the checks. Run all three before committing.
- `npm run check` runs `scripts/check-*.mjs` on Node alone, no dependency.
- `check:migrations` refuses an edit to a shipped migration. Run it with `--update` once a new one is final.
- Touching `lib/money.ts`, `lib/fingerprint.ts`, `db/migrations.ts`, or any aggregate in `db/repositories/` means running `npm run check` and adding a case to the matching file.
- Fresh clone: `npm start` once first. It makes `expo-env.d.ts`.
- No iOS builds here. Use Expo Go on a real iPhone.

## Rules

- Money is whole cents. **Never a float, not even briefly.** Parse digits as a string. Conversion only in `lib/money.ts`.
- `1.234` is Dutch thousands, not one euro twenty-three. Do not "fix" it.
- A trailing minus is a debit. `12,34-` is negative.
- Import fingerprints come from `lib/fingerprint.ts`. `nth === 0` must stay byte-identical to `date|cents|description` or every stored hash breaks.
- Amounts are signed. Expenses negative, income positive. Totals are `SUM`. Spend uses `SUM(-amount_cents)`.
- IDs are UUIDs — `newId()`.
- Deletes are soft. Always `WHERE deleted_at IS NULL`.
- SQL only in `db/repositories/`. Screens call repo functions.
- Reads use `useLedgerQuery`. After every write call `useInvalidateLedger()`.
- Use `withTransaction()` from `db/util.ts`. Never `withExclusiveTransactionAsync`.
- `MIGRATIONS` in `db/migrations.ts` is append-only. Never edit or reorder a shipped one. Fix old rows in a new migration, by id. `npm run check:migrations` enforces this.
- Every ledger table carries `id`, `household_id`, `created_at`, `updated_at`, `deleted_at`. Only `settings` is exempt.
- A unique index must exclude soft-deleted rows.
- Imports dedupe on a content hash: date + amount + cleaned description.
- A backup is encrypted by default. **A restore reads the Argon2 parameters out of the file, never from `KDF_PARAMS`** — reading them from the source strands every backup written before the cost was raised.
- A receipt name from a backup is joined onto a path. It goes through `isSafeReceiptName` first, every time.
- Budgets: a `YYYY-MM` row beats the recurring row.
- Import rules fill an empty category only. Never overwrite one set by hand.

## The release workflow

`.github/workflows/android.yml` holds the four signing secrets. Losing the keystore ends the upgrade path for every user.

- Every `uses:` is pinned to a 40-character commit SHA. Never a tag.
- To move one: `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.
- Top-level `permissions` stays `contents: read`. Only the `release` job gets `write`.
- The `release` job runs no repository code. No `npm`, no Gradle, no prebuild.
- Never interpolate a secret into a `run:` line. Pass it via `env:`.
- `npm run check:workflow` enforces all of this.

## Design

Direction contract: the comment at the top of `src/app/_layout.tsx`. Keep it true.

- Categories are rail routes. Six fixed line colours in `constants/theme.ts`.
- Light and dark both real. Line colours stay, ground and ink swap.
- Budget trouble is never colour alone. Say it in words too.
- Pill or plate. Nothing between.
- Every amount goes through `Money`.
- A line colour used as lettering takes the `onGround` variant.
- Strokes are 1 / 2 / 6 / 10. Radii are full / 12 / 20 / 28.

## Skills

- `/impeccable` — any UI, visual, or design work.
- `expo:*` — Expo APIs, router, EAS.
- `superpowers:brainstorming` before building something new.
- `superpowers:systematic-debugging` on a bug.

## After every change

Commit and push. Do not ask. Standing permission, whatever branch is checked out.

One change, one commit:

1. Bump the version in `package.json`, `app.json` and `package-lock.json`. Same commit.
2. Bump `android.versionCode` in `app.json` when the commit is meant to be installed.
3. `npm run typecheck`, `npm run lint` and `npm run check`. All must exit 0.
4. Push.

"Done" means it works, not that the edit landed.

## Tidy-up pass

After a feature is finished and verified. Separate commit.

- Behaviour-preserving only. Move, merge, rename, delete.
- Scope is what the feature touched, plus what it made redundant.
- Never touch shipped migrations, the cents convention, or the signed-amount convention.
- Typecheck, lint, walk the app.
- Nothing to move? Say so and skip.

## Session end

On "session ends", "we're done", "wrap up", "that's it for today", any wording:

1. Rewrite `HANDOFF.md` completely. Overwrite, do not append.
2. Commit with the version bump.
3. Push.

## Versioning

Format `0.1.2.3`.

| Position | Meaning |
| --- | --- |
| `0` | Stays `0` until full release. |
| `1` | Major step. **Never bump without the user asking.** |
| `2` | Smaller but important. |
| `3` | Minor fixes. |

Bump one position per commit. Lower positions reset to `0`. Double digits are fine.

---

## In short

Fare is a local-first budgeting app for iOS and Android. Everything lives in
SQLite on the phone — no account, no server, works offline. A month of money is
drawn as a rail diagram: each category is a route, its monthly limit is the end of
the line, and spending is how far along you have travelled.

Money is stored as whole cents and signed, so nothing rounds and any total is a
plain `SUM`. Migrations only ever get appended, because the database is already on
someone's phone. There are no tests, so the checks are `typecheck`, `lint`, and
walking the app yourself. Every change ships as one commit with a version bump.
