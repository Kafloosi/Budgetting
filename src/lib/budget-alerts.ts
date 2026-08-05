/**
 * Telling you where a route stands, while the app is shut.
 *
 * The one thing a budget limit cannot do from inside a closed app is warn you,
 * and a limit you only discover having blown is not a limit. This is checked when
 * the app comes to the foreground rather than on a background schedule: the
 * numbers only move when a transaction is written, and every path that writes one
 * goes through this app.
 *
 * The consequence is honest and worth stating: an alert arrives the next time Fare
 * is opened, not the moment a card is tapped. Nothing here reaches a server, and
 * a local-first app has no other way to know.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { getBudgetProgress, WARNING_THRESHOLD } from '@/db/repositories/budgets';
import { alertKey, listAlerted, pruneAlerted, recordAlerted } from '@/db/repositories/settings';
import type { MonthKey } from '@/db/types';
import { formatMoney } from '@/lib/money';
import { canNotify, notify } from '@/lib/notifications';

export interface AlertOptions {
  locale: string;
  currency: string;
}

/**
 * Sends at most one alert per category per threshold per month.
 *
 * Crossing 80% and then passing the limit are two separate things worth hearing
 * about; hearing either of them twice is noise, and noise is what gets an app's
 * notifications switched off for good.
 */
export async function checkBudgetAlerts(
  db: SQLiteDatabase,
  month: MonthKey,
  options: AlertOptions,
): Promise<number> {
  // Checked every time rather than trusted: permission can be revoked in the OS
  // long after the toggle in Settings was turned on.
  if (!(await canNotify())) return 0;

  const progress = await getBudgetProgress(db, month);
  const interesting = progress.filter((entry) => entry.status !== 'under');
  if (interesting.length === 0) {
    await pruneAlerted(db, month);
    return 0;
  }

  const already = await listAlerted(db, month);
  const money = (cents: number) => formatMoney(cents, options);
  let sent = 0;

  for (const entry of interesting) {
    const threshold = entry.status === 'over' ? 'over' : 'warning';
    const key = alertKey(entry.category_id, month, threshold);
    if (already.has(key)) continue;

    if (threshold === 'over') {
      await notify(
        `${entry.category_name} is past its limit`,
        `${money(Math.abs(entry.remaining_cents))} over, with ${money(entry.spent_cents)} spent of ${money(
          entry.effective_limit_cents,
        )}.`,
      );
    } else {
      await notify(
        `${entry.category_name} is close to its limit`,
        `${money(entry.remaining_cents)} left of ${money(entry.effective_limit_cents)} — ${Math.round(
          WARNING_THRESHOLD * 100,
        )}% of it is gone.`,
      );
    }

    await recordAlerted(db, key);
    // Passing the limit implies the warning, so a category that goes straight
    // past it does not get told off twice on the next open.
    if (threshold === 'over') {
      await recordAlerted(db, alertKey(entry.category_id, month, 'warning'));
    }
    sent++;
  }

  await pruneAlerted(db, month);
  return sent;
}
