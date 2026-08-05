import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import type { Timestamp } from './types';

/**
 * Runs `work` inside a transaction on every platform.
 *
 * `withExclusiveTransactionAsync` throws on web — wa-sqlite has no second
 * connection to lock out — so web falls back to an ordinary transaction. It
 * gives up the exclusivity guarantee, which only matters when two connections
 * write at once, and web is a single-connection development surface.
 */
export async function withTransaction(
  db: SQLiteDatabase,
  work: (txn: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => work(db));
    return;
  }
  await db.withExclusiveTransactionAsync(work);
}

/** UUID v4. Generated on-device so offline creates never collide. */
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): Timestamp {
  return new Date().toISOString();
}
