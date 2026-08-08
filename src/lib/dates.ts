/**
 * Calendar maths.
 *
 * The month is the unit of the whole product, so almost every screen needs to
 * name one, step to the next, or ask how far through it we are. None of that is
 * a database concern, which is why it does not live in `db/util.ts` — it only
 * ever did because the first month query needed `monthBounds`.
 *
 * Everything here is local time, not UTC. A transaction logged at 23:00 belongs
 * to the day the user was living in, not the day in Greenwich.
 */

import type { DateOnly, MonthKey } from '@/db/types';

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
