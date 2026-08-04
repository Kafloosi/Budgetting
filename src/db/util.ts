import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import type { DateOnly, MonthKey, Timestamp } from './types';

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

/** Shifts a `YYYY-MM-DD` by whole days, staying on the calendar. */
export function shiftDays(date: DateOnly, delta: number): DateOnly {
  const [year, month, day] = date.split('-').map(Number);
  return toDateOnly(new Date(year, month - 1, day + delta));
}

/**
 * Shifts a `YYYY-MM-DD` by whole months, clamped to the end of the target
 * month. The 31st plus one month is the 28th of February, not the 3rd of
 * March — a rule anchored on the 31st has to keep landing in its own month.
 */
export function shiftDaysByMonth(date: DateOnly, delta: number): DateOnly {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(year, month + delta, 0).getDate();
  return toDateOnly(new Date(year, month - 1 + delta, Math.min(day, lastDay)));
}

/** Whole months from one `YYYY-MM` to another; negative when `to` is earlier. */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/** Days in a `YYYY-MM`. */
export function daysInMonth(month: MonthKey): number {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(year, monthIndex, 0).getDate();
}

/**
 * How much of `month` has been lived through, in days.
 *
 * A past month is fully elapsed, a future one has not started, and the current
 * month counts today — dividing by this never yields a divide-by-zero.
 */
export function elapsedDaysInMonth(month: MonthKey, today = new Date()): number {
  const current = toMonthKey(today);
  if (month < current) return daysInMonth(month);
  if (month > current) return 0;
  return today.getDate();
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
