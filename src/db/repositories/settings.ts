import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso } from '../util';

/**
 * Device settings. Key-value, because there will never be enough of them to
 * earn columns, and a new preference should not cost a migration.
 */
/** Which enamel to fire the diagram on, or let the phone decide. */
export type AppearancePreference = 'system' | 'enamel' | 'porcelain';

export interface Settings {
  /** BCP-47 tag used for number, currency and date formatting. */
  locale: string;
  /** ISO-4217 code. One currency for the whole ledger — see PRODUCT.md. */
  currency: string;
  /** Set once the user has been past first run, so it never shows twice. */
  onboarded: boolean;
  appearance: AppearancePreference;
  /** Require the phone's own biometrics or passcode before the ledger opens. */
  appLock: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'nl-NL',
  currency: 'EUR',
  onboarded: false,
  appearance: 'system',
  appLock: false,
};

export async function loadSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );

  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const appearance = stored.get('appearance');
  return {
    locale: stored.get('locale') ?? DEFAULT_SETTINGS.locale,
    currency: stored.get('currency') ?? DEFAULT_SETTINGS.currency,
    onboarded: stored.get('onboarded') === '1',
    appearance:
      appearance === 'enamel' || appearance === 'porcelain' ? appearance : DEFAULT_SETTINGS.appearance,
    appLock: stored.get('appLock') === '1',
  };
}

/** Writes only the keys present in `patch`. */
export async function saveSettings(
  db: SQLiteDatabase,
  patch: Partial<Settings>,
): Promise<void> {
  const now = nowIso();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db.runAsync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value), now],
    );
  }
}
