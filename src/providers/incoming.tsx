/**
 * A statement that arrives instead of being fetched.
 *
 * Mounted inside AppLockGate so that a re-lock unmounts it along with the rest
 * of the app. That alone does not keep it off the file while the app is
 * *starting* locked: AppLockGate renders its children while `useSettings()` is
 * still `loading`, because it does not yet know whether a lock is enforced, and
 * child effects run before parent effects — so this provider's effect would
 * otherwise fire before settings have even been read. The effect below waits
 * for `loading` to clear before touching the file, which is what actually
 * keeps a locked launch from reading anything: either settings finish loading
 * and say no lock is enforced (children stay mounted, the effect proceeds), or
 * they say one is (AppLockGate swaps to the lock screen and this unmounts
 * before its gated effect ever runs).
 *
 * A recognised format goes straight into the ledger. An unrecognised one is
 * handed to the import screen, which is the same screen it would have reached by
 * hand — one step shorter, because the file is already open.
 */

import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, type ReactNode } from 'react';

import { findPresetForHeader } from '@/db/repositories/import-presets';
import { runImport, undoImport } from '@/db/repositories/transactions';
import { parseCsv, type DateFormat } from '@/lib/csv';
import { IncomingFileError, readIncomingFile } from '@/lib/incoming-file';
import { useInvalidateLedger } from '@/providers/ledger';
import { useSettings } from '@/providers/settings';
import { useUndo } from '@/providers/undo';

/**
 * The file waiting for the import screen.
 *
 * Module-scoped rather than a route param because a statement can be megabytes
 * and navigation state is not the place for it. One-shot: taking it clears it,
 * so a later visit to the import screen by hand does not reopen a stale file.
 */
let pending: { name: string; text: string } | null = null;

export function setPendingImport(file: { name: string; text: string }): void {
  pending = file;
}

export function takePendingImport(): { name: string; text: string } | null {
  const held = pending;
  pending = null;
  return held;
}

/**
 * The launch URL already turned into an import (or ruled out).
 *
 * Module-scoped, not a ref: `useLinkingURL()` reseeds itself from the OS's
 * stored launch URL — `ExpoLinking.getLinkingURL()` — synchronously on every
 * mount, for as long as the process lives. AppLockGate unmounts this provider
 * on re-lock and remounts it on unlock, so a ref would forget the URL was
 * already handled and reprocess the same file on every unlock. A module-level
 * value survives the remount the way a ref cannot.
 */
let handledUrl: string | null = null;

export function IncomingFileProvider({ children }: { children: ReactNode }) {
  const url = useLinkingURL();
  const db = useSQLiteContext();
  const router = useRouter();
  const invalidate = useInvalidateLedger();
  const { offer } = useUndo();
  const { loading: settingsLoading } = useSettings();

  useEffect(() => {
    // AppLockGate itself renders children while settings are still loading,
    // because it does not yet know whether a lock is enforced. Waiting here
    // is what actually keeps a locked launch from being read — see the file
    // header.
    if (settingsLoading) return;
    if (!url || handledUrl === url) return;
    // fare:// links are routes, and expo-router already owns them.
    if (url.startsWith('fare://')) return;
    handledUrl = url;

    let cancelled = false;

    (async () => {
      try {
        const { name, text } = await readIncomingFile(url);
        if (cancelled) return;

        const csv = parseCsv(text);
        if (csv.rows.length === 0) {
          offer(`${name} has no transactions in it`, () => {});
          return;
        }

        const preset = await findPresetForHeader(db, csv.header);
        if (cancelled) return;

        if (!preset) {
          // Never seen this bank's columns. The screen asks, once, and saving
          // the format there is what makes every later file automatic.
          setPendingImport({ name, text });
          router.push('/import');
          return;
        }

        const outcome = await runImport(db, csv.rows, {
          date: preset.date_column,
          amount: preset.amount_column,
          description: preset.description_column,
          format: preset.date_format as DateFormat,
          allNegative: preset.all_negative === 1,
        });

        // Written unconditionally, even if the provider unmounted mid-import
        // (a re-lock during the write) — the ledger must never be left
        // written-but-stale just because nothing is around to show a toast.
        invalidate();
        if (cancelled) return;

        if (outcome.inserted === 0) {
          offer(`${preset.name}: nothing new`, () => {});
          return;
        }

        offer(`${outcome.inserted} added from ${preset.name}`, async () => {
          await undoImport(db, outcome.ids);
          invalidate();
        });
      } catch (error) {
        const message =
          error instanceof IncomingFileError
            ? error.message
            : `That file could not be read. ${(error as Error).message}`;
        if (!cancelled) offer(message, () => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, db, router, invalidate, offer, settingsLoading]);

  return <>{children}</>;
}
