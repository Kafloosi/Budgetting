import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Nothing in expo-sqlite pushes changes at us, so writes announce themselves by
 * bumping a revision every read subscribes to. One counter for the whole
 * ledger: a budget change moves the Month screen, an import moves everything,
 * and the queries here are small enough that finer invalidation would cost more
 * than it saves.
 */
const LedgerContext = createContext<{ revision: number; invalidate: () => void } | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision((n) => n + 1), []);
  const value = useMemo(() => ({ revision, invalidate }), [revision, invalidate]);
  return <LedgerContext value={value}>{children}</LedgerContext>;
}

function useLedgerContext() {
  const value = use(LedgerContext);
  if (!value) throw new Error('Ledger hooks must be used inside <LedgerProvider>');
  return value;
}

/** Call after any write so every open query re-runs. */
export function useInvalidateLedger(): () => void {
  return useLedgerContext().invalidate;
}

export interface LedgerQuery<T> {
  data: T | null;
  /** Only true on the very first run; a refresh keeps the previous data on screen. */
  loading: boolean;
  error: Error | null;
}

/**
 * Runs `run` against the database, again whenever `deps` change or the ledger
 * is invalidated. Keeps the last result visible while refetching, so adding a
 * transaction updates the Month screen without blanking it.
 */
export function useLedgerQuery<T>(
  run: (db: SQLiteDatabase) => Promise<T>,
  deps: readonly unknown[],
): LedgerQuery<T> {
  const db = useSQLiteContext();
  const { revision } = useLedgerContext();
  const [state, setState] = useState<LedgerQuery<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    run(db)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState((previous) => ({ ...previous, loading: false, error }));
      });
    return () => {
      cancelled = true;
    };
    // `run` is recreated every render by design; `deps` is the real key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, revision, ...deps]);

  return state;
}
