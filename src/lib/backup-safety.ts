/**
 * The copy taken before a restore. F-05's remaining half.
 *
 * A restore deletes every row before it writes, so the thing you would roll back
 * to is exactly what it just destroyed. `validateBackup` closed most of the gap
 * by refusing a bad file before anything is deleted, and the transaction covers
 * SQLite deciding to fail — but neither covers the file itself: a device that
 * runs out of space or loses power mid-write leaves a database that no
 * transaction is going to repair.
 *
 * So the file is copied aside first, and only deleted once the restore has
 * finished. If it is still there, something went wrong, and it is the ledger as
 * it was.
 *
 * What this deliberately does *not* do is swap the copy back in automatically.
 * The database is open, expo-sqlite holds a handle to it, and replacing the file
 * underneath a live connection is how a recoverable problem becomes an
 * unrecoverable one. The copy is left in place and named instead, which is
 * something a person can act on and a corrupted file is not.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Must match `databaseName` on the `SQLiteProvider` in `app/_layout.tsx`. */
export const DATABASE_NAME = 'budget.db';

const COPY_NAME = `${DATABASE_NAME}.before-restore`;

function sqliteDirectory(): Directory {
  return new Directory(Paths.document, 'SQLite');
}

function copyTarget(): File {
  return new File(sqliteDirectory(), COPY_NAME);
}

/**
 * Checkpoints the write-ahead log and copies the database aside.
 *
 * The checkpoint is the part that matters. In WAL mode the `.db` file alone is a
 * snapshot from some point in the past, with the recent truth living in
 * `budget.db-wal`; copying it without folding the log in first produces a
 * "backup" that is missing whatever the user did most recently — which they
 * would discover at the worst possible moment.
 *
 * Returns the copy, or null where there is nothing to copy: the web build keeps
 * its database somewhere this API cannot reach, and a first run may not have a
 * file yet.
 */
export async function copyDatabaseAside(db: SQLiteDatabase): Promise<File | null> {
  if (Platform.OS === 'web') return null;

  const source = new File(sqliteDirectory(), DATABASE_NAME);
  if (!source.exists) return null;

  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');

  const target = copyTarget();
  if (target.exists) target.delete();
  source.copy(target);
  return target.exists ? target : null;
}

/** Called once a restore has finished. The copy has no reason to outlive it. */
export function discardCopy(): void {
  const copy = copyTarget();
  if (copy.exists) copy.delete();
}

/**
 * A copy left behind by a restore that did not finish, if there is one.
 *
 * Read on the backup screen, because a safety net nobody is told about is not
 * one. It survives the app being killed, which is the case it exists for.
 */
export function strandedCopy(): File | null {
  const copy = copyTarget();
  return copy.exists ? copy : null;
}
