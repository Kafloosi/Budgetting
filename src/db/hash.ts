/**
 * Import fingerprinting.
 *
 * A bank statement downloaded twice, or two statements that overlap by a few days,
 * must not put the same transaction in the ledger twice. Every imported row carries
 * a hash of its content, and a partial unique index on that column makes the second
 * insert a no-op.
 *
 * The rule about which rows are "the same" lives in `lib/fingerprint.ts`, which has
 * no native dependency and can therefore be tested. This file only digests it.
 */

import * as Crypto from 'expo-crypto';

import { fingerprintInput } from '@/lib/fingerprint';

import type { DateOnly } from './types';

// Re-exported because the import rules match on the same flattened text, and one
// definition of "the same wording" is the point.
export { normaliseDescription } from '@/lib/fingerprint';

/**
 * Fingerprints a bank CSV row so re-importing an overlapping statement skips rows
 * that are already in the database.
 *
 * `nth` distinguishes genuinely repeated transactions — two identical coffees on one
 * day — from the same transaction seen twice. See `fingerprintInput`.
 *
 * Deliberately excludes the account, so the same transaction pulled from two exports
 * of the same account still collides.
 */
export async function importHash(
  date: DateOnly,
  amountCents: number,
  description: string,
  nth = 0,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    fingerprintInput(date, amountCents, description, nth),
  );
}
