/**
 * Telling you the ledger has gone quiet, while the app is shut.
 *
 * Same shape as `budget-alerts.ts`, checked on foreground rather than on a
 * background schedule: the thing this watches — when a statement was last read
 * in — only changes when an import lands, and every import goes through this
 * app.
 *
 * The decision lives in `lib/import-nudge.ts`, native-free and checkable under
 * Node. This file is only the delivery: asking permission, reading the two bits
 * of state `shouldNudge` needs, and sending.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { getImportNudgedAt, recordImportNudged } from '@/db/repositories/settings';
import { lastImportAt } from '@/db/repositories/transactions';
import { nowIso } from '@/db/util';
import { daysSinceImport, shouldNudge } from '@/lib/import-nudge';
import { canNotify, notify } from '@/lib/notifications';

/**
 * Sends at most one nudge per quiet spell. Returns whether one went out.
 */
export async function checkImportNudge(db: SQLiteDatabase): Promise<boolean> {
  // Checked every time rather than trusted: permission can be revoked in the OS
  // long after the toggle in Settings was turned on.
  if (!(await canNotify())) return false;

  const [last, nudgedAt] = await Promise.all([lastImportAt(db), getImportNudgedAt(db)]);
  const now = new Date();
  // The gate on the setting itself lives in the caller, the same way
  // `checkBudgetAlerts` is only ever called from behind `budgetAlerts` —
  // reaching this function at all means the toggle is already on.
  if (!shouldNudge(last, nudgedAt, now, true)) return false;

  const days = daysSinceImport(last, now);
  await notify(
    'Your ledger has gone quiet',
    `Nothing has been imported for ${days} days. Open a statement from your bank to catch up.`,
  );
  await recordImportNudged(db, nowIso());
  return true;
}
