# Handoff

Updated: 2026-08-05 · version 0.1.1.4

## Where we left off

- `v0.1.1.3` committed, tagged, and pushed to `origin/main`. The tag is the first one in the repo.
- `PRODUCT.md` written via `/impeccable init`: public app, one shared design language across iOS and Android, family sharing stays a schema seam only.
- `CLAUDE.md` (here and at `DEV/`) cut down and rewritten in plainer language. Added the skills section and this handoff rule.

## In flight

Nothing.

## Next

1. Decide the next real feature. The app has every core screen; nothing is half-built.
2. Store readiness is untouched: app name, icon, screenshots, privacy copy, EAS build.
3. Lint has 11 old warnings — `no-unused-expressions` in `db/repositories/categories.ts` and `transactions.ts`. Harmless, never cleaned up.

## Open decisions

- App name for the stores. `PRODUCT.md` lists it as undecided; `app.json` says "Fare".
- Multi-currency: the schema has a `currency` field per account, but nothing decides whether the product supports more than one.
- Whether accounts are shown to the user at all.
