import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { catchUpRecurring } from '@/db/repositories/recurring';
import { purgeExpired } from '@/db/repositories/trash';
import { toDateOnly } from '@/db/util';
import { useInvalidateLedger } from '@/providers/ledger';

/**
 * Advances the ledger to "now".
 *
 * Two things drift while the app is closed: recurring entries that became due,
 * and trashed rows that outlived their retention. Both are settled here, once
 * on open and again whenever the app returns to the foreground — a phone left
 * open overnight crosses midnight without ever restarting, and would otherwise
 * still be showing yesterday's month.
 */
export function CatchUpProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const lastRunDay = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const today = toDateOnly(new Date());
      if (lastRunDay.current === today) return;
      lastRunDay.current = today;

      const [recurring, purged] = await Promise.all([
        catchUpRecurring(db, today),
        purgeExpired(db),
      ]);
      if (!cancelled && (recurring.created > 0 || purged > 0)) invalidate();
    }

    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [db, invalidate]);

  return <>{children}</>;
}
