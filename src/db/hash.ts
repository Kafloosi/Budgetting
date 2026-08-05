/**
 * Import fingerprinting.
 *
 * A bank statement downloaded twice, or two statements that overlap by a few
 * days, must not put the same transaction in the ledger twice. Every imported
 * row carries a hash of its content, and a partial unique index on that column
 * makes the second insert a no-op.
 */

import * as Crypto from 'expo-crypto';

import type { DateOnly } from './types';

/**
 * Flattens a bank's own wording so the same transaction fingerprints the same
 * way across exports.
 *
 * Banks pad, re-case and re-space their descriptions between exports of the
 * same account, and none of that is a difference in the transaction.
 */
export function normaliseDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Fingerprints a bank CSV row so re-importing an overlapping statement skips
 * rows that are already in the database.
 *
 * Deliberately excludes the account, so the same transaction pulled from two
 * exports of the same account still collides.
 */
export async function importHash(
  date: DateOnly,
  amountCents: number,
  description: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${date}|${amountCents}|${normaliseDescription(description)}`,
  );
}
