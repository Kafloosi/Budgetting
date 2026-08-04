/**
 * The currencies offered at first run and in settings.
 *
 * One currency covers the whole ledger, so this is a one-time choice rather
 * than a per-transaction field. Each entry carries the locale that formats it
 * the way its users actually write money, which is why `nl-NL` and `de-DE`
 * both appear for the euro.
 */
export interface CurrencyOption {
  code: string;
  locale: string;
  /** How the user recognises it in the list. */
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'EUR', locale: 'nl-NL', label: 'Euro — Netherlands' },
  { code: 'EUR', locale: 'de-DE', label: 'Euro — Germany, Austria' },
  { code: 'EUR', locale: 'fr-FR', label: 'Euro — France, Belgium' },
  { code: 'EUR', locale: 'en-IE', label: 'Euro — Ireland' },
  { code: 'GBP', locale: 'en-GB', label: 'Pound sterling' },
  { code: 'USD', locale: 'en-US', label: 'US dollar' },
  { code: 'CAD', locale: 'en-CA', label: 'Canadian dollar' },
  { code: 'AUD', locale: 'en-AU', label: 'Australian dollar' },
  { code: 'CHF', locale: 'de-CH', label: 'Swiss franc' },
  { code: 'SEK', locale: 'sv-SE', label: 'Swedish krona' },
  { code: 'NOK', locale: 'nb-NO', label: 'Norwegian krone' },
  { code: 'DKK', locale: 'da-DK', label: 'Danish krone' },
  { code: 'PLN', locale: 'pl-PL', label: 'Polish złoty' },
  { code: 'CZK', locale: 'cs-CZ', label: 'Czech koruna' },
  { code: 'JPY', locale: 'ja-JP', label: 'Japanese yen' },
  { code: 'INR', locale: 'en-IN', label: 'Indian rupee' },
  { code: 'BRL', locale: 'pt-BR', label: 'Brazilian real' },
  { code: 'ZAR', locale: 'en-ZA', label: 'South African rand' },
];

/** The bare symbol, for the keypad and other places a full format is too loud. */
export function currencySymbol(code: string, locale: string): string {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
  }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? code;
}
