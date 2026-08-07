# Statements that arrive by themselves

Design · 2026-08-07 · version 0.2.0.0

## What this is

Fare registers itself as something a CSV can be opened with. A statement shared
out of a banking app lands in the ledger, categorised, without passing through a
mapping screen — provided Fare has seen that bank's format before.

## Why not a bank connection

The feature this replaces was "connect your bank account, read-only, continuously
updated". It was designed away deliberately, and the reasoning matters more than
the conclusion because it will be raised again.

Connecting a real bank in the EU means PSD2, which means a licensed AISP or an
aggregator that is one. Every aggregator issues a secret that cannot ship inside
an APK — it is extractable in minutes, and embedding it breaches their terms
outright, which takes every connected user down at once rather than one at a
time. The secret therefore lives on a server, and a server that can reach bank
data is a server that sees bank data. That makes the author a GDPR controller:
a DPIA, a data processing agreement, a seventy-two hour breach duty, and a
central store of other people's financial history, which is a target that
attracts effort in proportion to what is in it.

Against that, the thing being bought is freshness. And the pipeline from a file
to a categorised ledger is already built and already good: formats are recognised
by their heading row, rows are deduplicated by content hash, rules assign
categories, and the triage queue catches what they cannot. What is missing is not
intelligence. It is that the file has to be fetched by hand.

So this ships the delivery and leaves the aggregator alone. The gap is honest and
should be stated rather than dressed up: a bank connection updates overnight
while this needs three taps and a human who remembers. If users ask for zero
touch loudly enough, the aggregator becomes a real decision informed by real
demand, and it would feed this same pipeline.

## Scope

In:

- A CSV opened or shared from another app is handled by Fare.
- A recognised format imports without a mapping screen, and offers undo.
- An unrecognised one opens today's import screen with the file already loaded.
- A nudge when imports have gone stale.

Out:

- Balances. A statement carries transactions, not a running balance.
- Aggregators, servers, background fetch. `src/` stays free of `fetch`.
- Any change to money parsing, fingerprints, or the signed-amount convention.

## Architecture

Three pieces. One of them is a refactor of code that already exists, and doing it
first is what makes the other two small.

### `lib/import-run.ts` — the pipeline, extracted

The whole import lives inside the `run()` closure in `src/app/import.tsx`:
drafts, the rule matcher, ordinals, hashing, the bulk insert. Nothing that is not
a React component can reach it, so an automatic import would have to reimplement
it, and a second copy of the rule that decides what counts as the same
transaction is the last thing this repo needs.

It moves out whole, behaviour unchanged:

```ts
runImport(db, csv, mapping): Promise<{
  inserted: number;
  skipped: number;
  invalid: number;
  ids: string[];
}>
```

`import.tsx` calls it and gets shorter. The automatic path calls the same
function. There is one import pipeline and nowhere for a second one to drift to.

`invalid` is new and is the count of rows `toDraft` refused. The screen could
show that from its own preview; a headless import has no preview, and silently
dropping rows from a file nobody looked at is the failure mode worth avoiding.

`ids` is new and exists for undo.

### `lib/incoming-file.ts` — delivery

Turns a delivered URI into `{ name, text }` and deletes the copy afterwards. iOS
leaves received documents in the app's Inbox until something removes them.

It checks size before reading, and refuses anything over **10 MB**. A file
arriving from another app is untrusted in a way a file the user picked is not,
and `File.text()` on something large enough is a crash rather than an error
message. Ten megabytes is roughly two orders of magnitude above a year of
statements and comfortably below anything that costs memory.

### The nudge

Days since `MAX(created_at)` over transactions with `source = 'import'`. The
threshold lives in the existing `settings` table and defaults to **14 days** —
long enough that a monthly statement does not nag twice, short enough that a
forgotten month is caught inside it.

It stays off until the first successful automatic import. Reminding someone to do
a thing they have never done is not a reminder, and the first import is also the
one that teaches Fare the format — before that, the nudge cannot deliver what it
promises.

`lib/budget-alerts.ts` is the pattern to follow; `expo-notifications` is already
a dependency.

## Data flow

```
bank app → Share / Open with → Fare
                 │
         app locked? ──── yes ──→ hold until unlocked
                 │ no
          header signature
                 │
     ┌───────────┴────────────┐
 recognised                unknown
     │                        │
 runImport()            import screen,
     │                  file preloaded
 summary + undo
```

Recognised means `findPresetForHeader()` returned a preset. The first file from a
bank still goes through the mapping screen once, and saving the format there is
what makes every later file automatic. That is the preset mechanism doing the job
it was built for; nothing about it changes.

## Undo

`bulkInsertImported` returns counts today. It also returns the ids it inserted,
and the undo bar offers `47 added — Undo` for its five seconds, soft-deleting
that batch.

An automatic import writes to the ledger without anyone having asked in that
moment. Forty-seven rows appearing with no way back except the trash screen, one
row at a time, is not an acceptable answer to a file shared by mistake.

## The unknown, stated plainly

Android delivers a file two ways and they are not the same:

- `ACTION_VIEW` — Open with. The URI is the intent data, so
  `Linking.getInitialURL()` returns it. Nothing new is needed.
- `ACTION_SEND` — the Share sheet. The URI is in `EXTRA_STREAM`, which React
  Native's Linking module does not read. It returns null.

So `Share → Fare` may need a shim that `expo-linking` does not provide. This gets
verified against the SDK 57 documentation during planning, per `AGENTS.md`. If it
turns out to need a dependency, that comes back as a question rather than
arriving in a diff — the pitch is an app that asks for nothing, and a build-time
plugin is still a thing to justify.

iOS needs no shim. `CFBundleDocumentTypes` puts *Copy to Fare* in the share sheet
without a share extension.

Both are config plugin work, following `plugins/with-quick-add-shortcut`:
`android/` is gitignored, every build regenerates it, and an edit to the manifest
by hand is wiped by the next prebuild.

## Error handling

| Case | Behaviour |
| --- | --- |
| Over the size cap | Refused by name and size, before it is read |
| Not a CSV, or no rows | "That file has a heading row but no transactions in it" — today's wording |
| Some rows unparseable | Good rows import; the rest are counted in the summary |
| Every row unparseable | Nothing inserted; falls through to the mapping screen |
| App locked | Held until unlocked |
| The same file twice | Nothing inserted, by fingerprint. Already true |

The locked case is the one worth being deliberate about. An incoming file must
not be a way of getting the ledger to do something while the app lock is on.

Held means held in memory, for that launch only. If the app is killed before the
lock is opened, the file is forgotten and the user shares it again — which costs
three taps. Persisting a queue of pending files would mean writing the contents
of a bank statement to disk outside the ledger, to be processed later by a path
nobody was watching. That is a worse trade than making someone repeat a gesture.

## What this does not touch

No migration. The nudge derives from the ledger, and its threshold fits the
`settings` table as it stands. So there is no append-only risk here and no
`check:migrations --update` to remember.

`lib/money.ts`, `lib/fingerprint.ts` and `db/migrations.ts` are all unchanged.

## Verification

`npm run typecheck`, `npm run lint` and `npm run check`, all exiting 0.

A new `scripts/check-import-run.mjs` alongside the existing checks, asserting the
extracted pipeline against a real SQLite database through `node:sqlite`: that a
statement imports, that the same statement imported twice inserts nothing the
second time, that two identical rows on one day stay two rows, and that the
returned ids are the rows that landed.

Then the app itself, which is the check the others cannot be:

1. Share an ING export from the banking app. It lands, categorised.
2. Share the same file again. Nothing lands.
3. Share a format Fare has never seen. The mapping screen opens with it loaded.
4. Lock the app, share a file. Nothing happens until it is unlocked.

## Open

One thing, and it is a question about the platform rather than about the design:
whether `Share → Fare` needs a native shim on Android, or whether `ACTION_VIEW`
alone is enough in practice. Banking apps commonly download to a file and notify,
and tapping that notification is the `ACTION_VIEW` path. Answered during planning
against the SDK 57 documentation.
