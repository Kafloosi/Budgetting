import { useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppearancePreference,
  type Settings,
} from '@/db/repositories/settings';
import { currencySymbol } from '@/lib/currencies';
import { formatAbsMoney, formatMoney } from '@/lib/money';

interface SettingsValue {
  settings: Settings;
  /** True until the first read from the database lands. */
  loading: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSettings(db).then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      // Optimistic: a currency change should repaint every amount on screen
      // before the write returns, not after.
      setSettings((current) => ({ ...current, ...patch }));
      await saveSettings(db, patch);
    },
    [db],
  );

  const value = useMemo(() => ({ settings, loading, update }), [settings, loading, update]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsValue {
  const value = use(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}

/**
 * The appearance preference, readable from anywhere.
 *
 * The boot screen renders before the provider exists, so this answers
 * "system" rather than throwing — the OS appearance is the right guess for the
 * one frame it covers.
 */
export function useAppearancePreference(): AppearancePreference {
  return use(SettingsContext)?.settings.appearance ?? 'system';
}

/**
 * Money formatting bound to the user's chosen currency.
 *
 * `lib/money.ts` stays the only place cents become strings; this just supplies
 * it the locale and currency instead of letting each screen guess.
 */
export function useMoney() {
  const { settings } = useSettings();
  const { locale, currency } = settings;

  return useMemo(
    () => ({
      locale,
      currency,
      symbol: currencySymbol(currency, locale),
      format: (cents: number, signDisplay: 'auto' | 'always' | 'never' = 'auto') =>
        formatMoney(cents, { locale, currency, signDisplay }),
      formatAbs: (cents: number) => formatAbsMoney(cents, { locale, currency }),
      /**
       * The number without its currency symbol, for the second half of a pair
       * where the first half already carries it — `€ 90,65 / 400,00`.
       */
      plain: (cents: number) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Math.abs(cents) / 100),
    }),
    [locale, currency],
  );
}
