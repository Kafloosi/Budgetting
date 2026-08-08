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
  /** Notify when a category reaches 80% of its limit, and again when it passes it. */
  budgetAlerts: boolean;
  /** Notify when nothing has been imported in a while. */
  importNudge: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'nl-NL',
  currency: 'EUR',
  onboarded: false,
  appearance: 'system',
  appLock: false,
  // Off until asked for. An app that notifies before being told to is an app
  // whose notifications get turned off at the OS level, permanently.
  budgetAlerts: false,
  importNudge: false,
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
    budgetAlerts: stored.get('budgetAlerts') === '1',
    importNudge: stored.get('importNudge') === '1',
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

/**
 * Which budget alerts have already been sent, so none is sent twice.
 *
 * Kept in the settings table rather than earning one of its own — a record of
 * what has been said is not worth a migration. It does ride along in a backup,
 * which is the behaviour you want: restoring a ledger should not re-announce a
 * month you have already been told about.
 *
 * The key is `alerted:<category>:<month>:<threshold>`, so crossing 80% and then
 * passing the limit are two separate events in the same month.
 */
const ALERT_PREFIX = 'alerted:';

export async function listAlerted(db: SQLiteDatabase, month: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ key: string }>(
    'SELECT key FROM settings WHERE key LIKE ?',
    [`${ALERT_PREFIX}%:${month}:%`],
  );
  return new Set(rows.map((row) => row.key));
}

export function alertKey(categoryId: string, month: string, threshold: 'warning' | 'over'): string {
  return `${ALERT_PREFIX}${categoryId}:${month}:${threshold}`;
}

export async function recordAlerted(db: SQLiteDatabase, key: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, '1', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at`,
    [key, nowIso()],
  );
}

/**
 * Drops the record for months that are over, so the settings table does not grow
 * by a row per category per month forever.
 */
export async function pruneAlerted(db: SQLiteDatabase, keepMonth: string): Promise<void> {
  const rows = await db.getAllAsync<{ key: string }>(
    'SELECT key FROM settings WHERE key LIKE ?',
    [`${ALERT_PREFIX}%`],
  );
  for (const { key } of rows) {
    // alerted:<category>:<month>:<threshold> — the month is the second-to-last part.
    const parts = key.split(':');
    const month = parts[parts.length - 2];
    if (month < keepMonth) await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
  }
}

/**
 * When the ledger was last nudged for going quiet, or null if never.
 *
 * Kept out of `Settings` — a timestamp that moves on its own is not settings
 * state, the same reasoning that keeps the `alerted:*` keys off it. A single
 * key rather than a prefixed family: unlike budget alerts, there is only ever
 * one quiet spell in progress at a time, so there is only ever one timestamp
 * to remember.
 */
const IMPORT_NUDGED_KEY = 'importNudgedAt';

export async function getImportNudgedAt(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [IMPORT_NUDGED_KEY],
  );
  return row?.value ?? null;
}

export async function recordImportNudged(db: SQLiteDatabase, when: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [IMPORT_NUDGED_KEY, when, when],
  );
}
