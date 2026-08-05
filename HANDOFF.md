# Handoff

Updated: 2026-08-05 · version 0.1.1.5

## Where we left off

- `PRODUCT.md` written via `/impeccable init`. Confirmed: public app for general users, one shared design language across iOS and Android (not an HIG/Material fork), family sharing stays a schema seam only.
- `v0.1.1.3` pushed and tagged — the repo's first tag.
- `0.1.1.4` cut both `CLAUDE.md` files down (100 → 70 lines combined), added the skills section, and added the session-end handoff rule that produced this file.
- Code itself untouched this session. Docs and product record only.

## In flight

Nothing.

## Next

1. Pick the next real feature. Every core screen exists; nothing is half-built.
2. Store readiness is untouched: final app name, icon, screenshots, privacy copy, EAS build. iOS needs EAS or a borrowed Mac.
3. Optional cleanup: 11 old `no-unused-expressions` lint warnings in `db/repositories/categories.ts` and `transactions.ts`. Harmless.

## Open decisions

- App name for the stores. `PRODUCT.md` says undecided; `app.json` says "Fare".
- Multi-currency — the schema carries `currency` per account, but nothing decides whether the product supports more than one.
- Whether accounts are surfaced to the user at all.
