import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Keypad } from '@/components/transit/keypad';
import { RouteLine } from '@/components/transit/route';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { getBudgetProgress, getRecurringLimits, removeBudget, setBudget } from '@/db/repositories/budgets';
import { getCategory } from '@/db/repositories/categories';
import { getCategorySpend } from '@/db/repositories/transactions';
import { formatMonthLabel } from '@/db/util';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

type Scope = 'recurring' | 'month';

/**
 * Where a route ends.
 *
 * A limit is either the standing one that applies every month, or an override
 * for this month alone — December is not November. The scope is picked before
 * the number so the choice is never ambiguous at the moment of saving.
 */
export default function BudgetScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateLedger();
  const { categoryId, month } = useLocalSearchParams<{ categoryId: string; month: string }>();

  const [scope, setScope] = useState<Scope>('recurring');
  const [cents, setCents] = useState(0);
  const [touched, setTouched] = useState(false);
  /** The scope + stored limit the keypad was last seeded from. */
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  const category = useLedgerQuery((database) => getCategory(database, categoryId), [categoryId]);
  const recurring = useLedgerQuery((database) => getRecurringLimits(database), []);
  const progress = useLedgerQuery((database) => getBudgetProgress(database, month), [month]);
  const spend = useLedgerQuery((database) => getCategorySpend(database, month), [month]);

  const existingRecurring = recurring.data?.[categoryId] ?? 0;
  const current = progress.data?.find((entry) => entry.category_id === categoryId);
  const spentCents =
    spend.data?.find((entry) => entry.category_id === categoryId)?.spent_cents ?? 0;
  const hasMonthOverride = Boolean(current && current.limit_cents !== existingRecurring);

  // Seed the keypad with whatever limit the chosen scope already has, until the
  // user types — after that the keypad is theirs.
  const seed = scope === 'recurring' ? existingRecurring : (current?.limit_cents ?? existingRecurring);
  const seedKey = `${scope}:${seed}`;
  if (!touched && seededFrom !== seedKey) {
    setSeededFrom(seedKey);
    setCents(seed);
  }

  const color = category.data?.color ?? Line.amber;
  const ratio = cents > 0 ? spentCents / cents : spentCents > 0 ? 2 : 0;
  const status = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'under';

  async function save() {
    if (cents <= 0) return;
    await setBudget(db, categoryId, scope === 'recurring' ? null : month, cents);
    invalidate();
    router.back();
  }

  function confirmRemove() {
    const scopeLabel = scope === 'recurring' ? 'the recurring limit' : `the limit for ${formatMonthLabel(month, money.locale)}`;
    Alert.alert(`Remove ${scopeLabel}?`, 'The category keeps its transactions; it just stops having an end of line.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeBudget(db, categoryId, scope === 'recurring' ? null : month);
          invalidate();
          router.back();
        },
      },
    ]);
  }

  const canRemove = scope === 'recurring' ? existingRecurring > 0 : hasMonthOverride;

  return (
    <Screen>
      <SheetHeader
        title={category.data?.name ?? 'Limit'}
        accent={color}
        onClose={() => router.back()}
        action={canRemove ? { label: 'Remove', onPress: confirmRemove, destructive: true } : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <CategoryRoundel
            size={44}
            color={color}
            icon={category.data?.icon}
            name={category.data?.name}
          />
          <View style={styles.identityBody}>
            <Text variant="bodyStrong">{category.data?.name ?? '—'}</Text>
            <Text variant="caption" tone="muted">
              {`${money.formatAbs(spentCents)} spent in ${formatMonthLabel(month, money.locale)}`}
            </Text>
          </View>
        </View>

        <View style={styles.scopes} accessibilityRole="radiogroup">
          <ScopePlate
            label="Every month"
            active={scope === 'recurring'}
            onPress={() => {
              setScope('recurring');
              setTouched(false);
            }}
          />
          <ScopePlate
            label={formatMonthLabel(month, money.locale)}
            active={scope === 'month'}
            onPress={() => {
              setScope('month');
              setTouched(false);
            }}
          />
        </View>

        <View style={styles.readout}>
          <Text variant="station" tone="muted">
            Limit
          </Text>
          <Text variant="display" tone={cents === 0 ? 'faint' : 'ink'}>
            {money.formatAbs(cents)}
          </Text>
        </View>

        <View style={styles.preview}>
          <RouteLine color={color} ratio={ratio} status={status} />
          <Text variant="caption" tone="muted">
            {cents > 0
              ? ratio > 1
                ? `${money.formatAbs(spentCents - cents)} over this limit already`
                : `${money.formatAbs(cents - spentCents)} would be left this month`
              : 'Enter a limit to see where this route ends'}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.dock,
          { borderTopColor: theme.rule, paddingBottom: Math.max(insets.bottom, Space.lg) },
        ]}>
        <Keypad
          onDigit={(digits) => {
            setTouched(true);
            const next = Number(`${cents}${digits}`);
            if (next <= 2_147_483_647) setCents(next);
          }}
          onBackspace={() => {
            setTouched(true);
            setCents(Math.floor(cents / 10));
          }}
        />
        <Button
          label={scope === 'recurring' ? 'Set for every month' : `Set for ${formatMonthLabel(month, money.locale)}`}
          onPress={save}
          disabled={cents <= 0}
        />
      </View>
    </Screen>
  );
}

function ScopePlate({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.plate,
        {
          borderColor: active ? theme.ink : theme.rule,
          backgroundColor: pressed ? theme.raised : 'transparent',
        },
      ]}>
      <View
        style={[
          styles.plateBullet,
          {
            borderColor: active ? theme.ink : theme.inkFaint,
            backgroundColor: active ? theme.ink : 'transparent',
          },
        ]}
      />
      <Text variant="station" tone={active ? 'ink' : 'muted'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.lg,
    paddingHorizontal: Space.lg,
    gap: Space.xl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  identityBody: {
    flex: 1,
    gap: 2,
  },
  scopes: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  plate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  plateBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
  },
  readout: {
    gap: Space.xs,
  },
  preview: {
    gap: Space.sm,
  },
  dock: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    gap: Space.md,
  },
});
