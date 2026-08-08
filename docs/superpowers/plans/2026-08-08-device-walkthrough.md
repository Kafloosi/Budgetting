# Walking 0.2.1.1 on a phone

The one verification this feature has not had.

Everything below was built and reviewed on a machine with no Android SDK, so
every native path in it has been typechecked and read, and **never once run**.
That is not a formality. Two of the three defects the final review found were
invisible to seven individually-clean task reviews, and both lived exactly here.

## What is already verified

`npm run typecheck`, `npm run lint`, `npm run check` — 8 check files, 148
assertions, all passing at `cf5d7ae`.

What those cover: the decision about which rows count as the same transaction,
the money and sign handling, the schema, the ledger arithmetic, the nudge's
thresholds and its one-per-quiet-spell rule, and the CSV handler registration in
`app.json`.

## What is not verified at all

Everything that touches the operating system:

- whether the intent filter fires, and whether `useLinkingURL()` hands back the
  CSV's URI rather than something else
- whether `new File(content://…)` can report `exists`, `size` and `text()`
- whether the ids returned by `bulkInsertImported` are the rows undo removes
- whether the app lock actually holds a file back
- whether the notification is ever delivered

## Build it

Expo Go cannot do this. Custom intent filters and document types are compiled
into the binary, so this needs a real build:

```bash
npx expo run:android
```

Without an Android SDK locally, the alternative is a `workflow_dispatch` run of
`.github/workflows/android.yml` and installing the APK by hand. `versionCode` is
`4`, so it installs over v0.1.6.1 and keeps the ledger.

## The three things most worth attacking

Ordered by where a defect is most likely and most expensive.

### 1. A real Android share, watching the filename

Open a `.csv` from Downloads, and again from a Gmail attachment.

This is the path everything else depends on, and it is where three native
behaviours get exercised for the first time. Watch what the import screen calls
the file. It should be a plausible name or the words "Shared statement" — never
a string like `msf%3A1000000123`.

**Known residue:** a Storage Access Framework URI from the primary volume
decodes to something like `primary:Download/statement.csv`. It passes the
extension test and is shown verbatim. Better than the raw basename, still not a
display name. Worth finishing if it looks bad in practice.

### 2. App lock on, re-lock mid-import

Turn on the app lock. Kill Fare. Open a CSV from the file manager.

Expect: the lock screen, nothing imported behind it, and the file still in
Downloads afterwards.

Then authenticate and let it import. Separately, share a statement and background
the phone for over 40 seconds while it is importing, then come back.

Expect: exactly one copy of those rows in the ledger. Not zero, not two.

This is the state machine that took two rounds of fixes and has never executed.

**Known and accepted:** if the re-lock lands after the write has started, the
rows land correctly but the undo bar never appears — its provider is unmounted at
that moment. The import is right; it is just silent.

### 3. Unrecognised, then recognised, then undo

Share a bank Fare has never seen. Expect the import screen with the file already
loaded. Save the format under the bank's name.

Share a second statement from the same bank. Expect it to land automatically with
an undo bar reading `N added from <bank>`.

Tap Undo. Expect the rows gone from the ledger and present in Trash.

Then re-share that same file. It re-imports cleanly — soft-deleted rows do not
block a re-import, because the unique index excludes them.

**Do not then restore those trashed rows.** Restoring a row whose `import_hash`
now matches a live row raises `SQLITE_CONSTRAINT`. The hazard predates this
feature — any manual delete followed by a re-import does it — but the undo bar
puts it two taps away. Worth fixing separately.

## Also worth trying

- Share a CSV that is not a statement — an address book export. Expect the
  mapping screen with nonsense guesses you can back out of, or a clear message.
  Never a crash, never rows in the ledger.
- Share the same statement twice. The second should report nothing new.
- Turn on **Settings → Alerts → Import reminder**. It is off by default and needs
  notification permission. Note that switching it on can fire the reminder
  immediately if the ledger is already 14 days quiet.

## One thing to file separately

`src/providers/settings.tsx:30` — `loadSettings(db).then(...)` has no `.catch()`.
A rejected read pins `loading` true forever, and `AppLockGate` renders its
children while `loading` is true. So a settings read failure leaves the app
**permanently unlocked**.

This is pre-existing and untouched by this branch, and it is a security bug
rather than an import bug. It deserves its own commit.

## Accepted, deliberately

Recorded so they are not rediscovered as surprises:

- **The Android share sheet does not work.** Only *Open with* and tapping a
  download notification. `expo-linking` in SDK 57 cannot read
  `Intent.EXTRA_STREAM`, where `ACTION_SEND` puts the URI. Supporting it needs a
  native shim or a dependency.
- **The reminder cannot be tapped to open the import screen.** There is no
  notification-response listener in the app; building one is its own work.
- **The 10 MB cap may not hold on Android.** `size` returns 0 when a content
  provider does not report one, and 0 passes the cap.
- Re-sharing an identical URI within one process is dropped silently.
- `check-app-config.mjs` flattens `data` across every VIEW filter, so a MIME type
  declared on the wrong filter would still pass.
