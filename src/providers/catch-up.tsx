import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { catchUpRecurring } from '@/db/repositories/recurring';
import { purgeExpired } from '@/db/repositories/trash';
import { checkBudgetAlerts } from '@/lib/budget-alerts';
import { toDateOnly, toMonthKey } from '@/lib/dates';
import { checkImportNudge } from '@/lib/import-alerts';
import { useInvalidateLedger } from '@/providers/ledger';
import { useSettings } from '@/providers/settings';

/**
 * Advances the ledger to "now", and says what changed.
 *
 * Two things drift while the app is closed: recurring entries that became due,
 * and trashed rows that outlived their retention. Both are settled here, once
 * on open and again whenever the app returns to the foreground — a phone left
 * open overnight crosses midnight without ever restarting, and would otherwise
 * still be showing yesterday's month.
 *
 * Budget alerts run alongside but on a different clock. Catching up is idempotent
 * per day, so it is guarded by the date; a limit can be crossed at any hour, so
 * the alert check runs on every foreground and relies on its own record of what it
 * has already sent.
 *
 * The import nudge rides along the same way, on its own record of what it has
 * already sent — see `lib/import-alerts.ts`.
 */
export function CatchUpProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { settings } = useSettings();
  const lastRunDay = useRef<string | null>(null);

  const { budgetAlerts, importNudge, locale, currency } = settings;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const today = toDateOnly(new Date());

      if (lastRunDay.current !== today) {
        lastRunDay.current = today;
        const [recurring, purged] = await Promise.all([
          catchUpRecurring(db, today),
          purgeExpired(db),
        ]);
        if (!cancelled && (recurring.created > 0 || purged > 0)) invalidate();
      }

      // After catch-up, so a recurring entry that pushed a category over its
      // limit is included rather than reported a foreground late.
      if (budgetAlerts && !cancelled) {
        await checkBudgetAlerts(db, toMonthKey(today), { locale, currency });
      }

      if (importNudge && !cancelled) {
        await checkImportNudge(db);
      }
    }

    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [db, invalidate, budgetAlerts, importNudge, locale, currency]);

  return <>{children}</>;
}
