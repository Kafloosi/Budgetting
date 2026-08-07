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
 * Deliberately never touches a float. `Number(x) * 100` happens to be exact for
 * every two-decimal value — measured, not assumed — but it is exact by luck of
 * double precision rather than by construction, it loses integers above
 * 2^53/100, and it turns a three-decimal input into a plausible wrong number
 * instead of a refusal. Digits are assembled as a string and cast once.
 *
 * Returns null when the input is not a number, so callers can show a
 * validation message instead of silently storing a 0.
 */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Trailing minus is how plenty of Dutch and German exports write a debit
  // (`12,34-`). Missing it does not round a number — it files every expense in
  // the file as income.
  const negative =
    /^-/.test(trimmed) || /-$/.test(trimmed) || /^\(.*\)$/.test(trimmed);
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

  // `normalised` is now plain digits with at most one dot as the decimal point.
  if (!/^\d*(\.\d*)?$/.test(normalised) || !/\d/.test(normalised)) return null;

  const [whole, fraction = ''] = normalised.split('.');

  // Three or more decimals that were not a thousands group mean the column
  // mapping is pointing at something that is not money — a rate, a quantity, a
  // balance in a foreign currency. No bank writes three decimals for a euro
  // amount, so saying so beats storing a confident fifth of the real figure.
  if (fraction.length > 2) return null;

  const cents = Number(`${whole || '0'}${fraction.padEnd(2, '0')}`);
  if (!Number.isSafeInteger(cents)) return null;

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
