/**
 * A statement that arrives instead of being fetched.
 *
 * Mounted inside AppLockGate deliberately. That gate renders its children only
 * once the lock is open, so this cannot run while the app is locked, and the
 * launch URL is still there to be read when it finally mounts. A file arriving
 * from another app is not a way past the lock, and it takes no queue to say so.
 *
 * A recognised format goes straight into the ledger. An unrecognised one is
 * handed to the import screen, which is the same screen it would have reached by
 * hand — one step shorter, because the file is already open.
 */

import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, type ReactNode } from 'react';

import { findPresetForHeader } from '@/db/repositories/import-presets';
import { runImport, undoImport } from '@/db/repositories/transactions';
import { parseCsv, type DateFormat } from '@/lib/csv';
import { IncomingFileError, readIncomingFile } from '@/lib/incoming-file';
import { useInvalidateLedger } from '@/providers/ledger';
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

export function IncomingFileProvider({ children }: { children: ReactNode }) {
  const url = useLinkingURL();
  const db = useSQLiteContext();
  const router = useRouter();
  const invalidate = useInvalidateLedger();
  const { offer } = useUndo();

  // The same launch URL is returned for as long as the app lives, so without
  // this the file would import again on every re-render.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handled.current === url) return;
    // fare:// links are routes, and expo-router already owns them.
    if (url.startsWith('fare://')) return;
    handled.current = url;

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
        if (cancelled) return;

        invalidate();

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
  }, [url, db, router, invalidate, offer]);

  return <>{children}</>;
}
