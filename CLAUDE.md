@AGENTS.md

# Fare

Local-first budgeting app, iOS + Android. v1 UI is built.

Read first: `HANDOFF.md` (where we left off) · `DESIGN.md` (before any visual change) · `PRODUCT.md` (who it is for) · `README.md` (how it works).

## Session start

Open every session with ten things worth doing next. Before the greeting, before
any question back.

- Read `HANDOFF.md` and the `README.md` feature table first. The list is drawn
  from the repo as it actually is, not from memory of it.
- Ten lines, ranked, best first. One line each: what it is, and why it is worth
  doing — the second half is the part that earns its place.
- Mix scales. Features, gaps, bugs, papercuts, store readiness. A list of ten
  features is a worse list.
- Prefer what the code proves. A table that ships with no UI, a screen that ends
  in a dead end, a `README.md` next step that never happened — these beat ideas.
- Never invent work to reach ten. Say so and stop short.
- Then wait. The list is an offer, not a plan.

## Commands

```bash
npm start          # dev server
npm run android    # emulator
npm run web
npm run typecheck
npm run lint
```

No tests exist. `typecheck` + `lint` are the only checks. On a fresh clone run `npm start` once first — it makes `expo-env.d.ts`.

No iOS builds here (Windows, no Xcode). Use Expo Go on a real iPhone.

## Rules that break things if ignored

- **Money is whole cents, never floats.** Text conversion only in `lib/money.ts`.
- **Amounts are signed.** Expenses negative, income positive. Totals are `SUM`. Spend queries use `SUM(-amount_cents)`.
- **IDs are UUIDs** (`newId()`). Two offline phones must not collide.
- **Deletes are soft.** Always `WHERE deleted_at IS NULL`.
- **SQL lives only in `db/repositories/`.** Screens call repo functions.
- **Reads use `useLedgerQuery`. After every write call `useInvalidateLedger()`** or the screen will not update.
- **Use `withTransaction()` from `db/util.ts`.** `withExclusiveTransactionAsync` throws on web.
- **`MIGRATIONS` in `db/migrations.ts` is append-only.** Never edit or reorder a shipped one. Fix old seed rows in a new migration, by id.
- **Imports dedupe on a content hash** (date + amount + cleaned description). Re-importing the same statement does nothing.
- **Budgets: a `YYYY-MM` row beats the recurring row** (`month` is null).

## Design

The direction contract is the comment at the top of `src/app/_layout.tsx`. Keep it true.

- Categories are rail routes. Six fixed line colours in `constants/theme.ts`.
- Light and dark are both real enamel, not an inversion: line colours stay, ground and ink swap.
- Budget trouble is never colour alone — say it in words too.

## Skills

Use the installed skills instead of winging it.

- `/impeccable` — any UI, visual, or design work. `PRODUCT.md` and `DESIGN.md` are its records.
- `expo:*` — Expo APIs, router, EAS builds and updates.
- `superpowers:brainstorming` before building something new; `superpowers:systematic-debugging` on a bug.

## Session end

When the user says the session is over — "session ends", "we're done", "wrap up", "that's it for today", any wording:

1. Rewrite `HANDOFF.md` completely (overwrite, do not append).
2. Commit it with the version bump for this session's work.
3. Push.

## Versioning

Every change ships as a commit with a version bump. Format `0.1.2.3`:

| Position | Meaning |
| --- | --- |
| `0` | Stays `0` until full release. |
| `1` | Major step toward release. **Never bump without the user asking.** |
| `2` | Smaller but still important changes. |
| `3` | Minor fixes — bugs, copy, tweaks. |

Any position can hit double digits. Bump one position per commit; lower positions reset to `0`. The number lives in `package.json` and `app.json`.
