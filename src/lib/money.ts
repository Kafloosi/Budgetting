/**
 * Money helpers. Everything in the app moves integer cents around; these are
 * the only places cents turn into strings a human reads, or vice versa.
 */

const DEFAULT_LOCALE = 'nl-NL';
const DEFAULT_CURRENCY = 'EUR';

/** e.g. `€ 1.234,56`. Pass `signDisplay` to force a leading + on income. */
export function formatMoney(
  cents: number,
  options: { locale?: string; currency?: string; signDisplay?: 'auto' | 'always' | 'never' } = {},
): string {
  const { locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY, signDisplay = 'auto' } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay,
  }).format(cents / 100);
}

/** Magnitude only — for places where a +/- badge already carries the sign. */
export function formatAbsMoney(cents: number, options?: { locale?: string; currency?: string }): string {
  return formatMoney(Math.abs(cents), options);
}

/**
 * Parses user or bank input into cents.
 *
 * Handles both decimal conventions, which is the whole difficulty: Dutch banks
 * write `1.234,56` while plenty of exports use `1,234.56`. The separator that
 * appears last is the decimal one; anything else is a thousands separator.
 *
 * Returns null when the input is not a number, so callers can show a
 * validation message instead of silently storing a 0.
 */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const negative = /^-/.test(trimmed) || /^\(.*\)$/.test(trimmed);
  const digitsOnly = trimmed.replace(/[^0-9.,]/g, '');
  if (!digitsOnly) return null;

  const lastComma = digitsOnly.lastIndexOf(',');
  const lastDot = digitsOnly.lastIndexOf('.');

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = digitsOnly;
  } else if (isLoneThousandsGroup(digitsOnly)) {
    // `1.234` is one thousand two hundred and thirty-four, not one euro
    // twenty-three — and `1,234` is the same number written the other way. No
    // currency this app formats has three decimal places, so a single separator
    // trailed by exactly three digits is grouping thousands, not splitting off
    // a fraction.
    normalised = digitsOnly.replace(/[.,]/g, '');
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator: strip dots, swap the comma for a dot.
    normalised = digitsOnly.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = digitsOnly.replace(/,/g, '');
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;

  // Rounding before the int cast avoids 19.99 * 100 landing on 1998.
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/**
 * True when every separator in the string is grouping thousands: one separator
 * character used throughout, and every group after the first exactly three
 * digits long. `1.234`, `1.234.567` and `12,345,678` qualify; `1.23`, `1.2345`
 * and `1.234,56` do not.
 *
 * Also rescues `1.234.567`, which the plain "last separator wins" reading turns
 * into `Number('1.234.567')` — NaN, and a silently dropped import row.
 */
function isLoneThousandsGroup(digitsOnly: string): boolean {
  return /^\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(digitsOnly);
}

/** Cents to a plain editable string like `12.34`, for text inputs. */
export function centsToInputString(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}
