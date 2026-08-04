import * as Crypto from 'expo-crypto';

import type { DateOnly, MonthKey, Timestamp } from './types';

/** UUID v4. Generated on-device so offline creates never collide. */
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): Timestamp {
  return new Date().toISOString();
}

/**
 * Fingerprints a bank CSV row so re-importing an overlapping statement skips
 * rows that are already in the database.
 *
 * Deliberately excludes the account, so the same transaction pulled from two
 * exports of the same account still collides. Description is normalised because
 * banks pad and re-case their own descriptions between exports.
 */
export async function importHash(
  date: DateOnly,
  amountCents: number,
  description: string,
): Promise<string> {
  const normalised = description.trim().toLowerCase().replace(/\s+/g, ' ');
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${date}|${amountCents}|${normalised}`,
  );
}

/** `YYYY-MM-DD` for a Date, in local time rather than UTC. */
export function toDateOnly(date: Date): DateOnly {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM` for a Date or a `YYYY-MM-DD` string. */
export function toMonthKey(date: Date | DateOnly): MonthKey {
  return typeof date === 'string' ? date.slice(0, 7) : toDateOnly(date).slice(0, 7);
}

/** Shifts a `YYYY-MM` key by a number of months, e.g. `-1` for the month before. */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex - 1 + delta, 1);
  return toMonthKey(date);
}

/** First and last day of a `YYYY-MM`, inclusive, for BETWEEN queries. */
export function monthBounds(month: MonthKey): { start: DateOnly; end: DateOnly } {
  const [year, monthIndex] = month.split('-').map(Number);
  return {
    start: `${month}-01`,
    end: toDateOnly(new Date(year, monthIndex, 0)),
  };
}

/** e.g. `August 2026`. */
export function formatMonthLabel(month: MonthKey, locale = 'en-GB'): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}
