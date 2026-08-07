import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Money } from '@/components/money';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Keypad } from '@/components/transit/keypad';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { listCategories } from '@/db/repositories/categories';
import { splitTransaction } from '@/db/repositories/splits';
import { getTransaction } from '@/db/repositories/transactions';
import type { Category } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

interface Part {
  key: string;
  cents: number;
  categoryId: string | null;
}

/**
 * Dividing one payment between lines.
 *
 * The remainder is the whole interface. It starts as the full amount and has to
 * reach zero before the split can be saved, so the parts always add up to the
 * original exactly — cents cannot go missing into a rounding error somebody finds
 * in a total three months later.
 */
export default function SplitScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [parts, setParts] = useState<Part[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  const transaction = useLedgerQuery((database) => getTransaction(database, id), [id]);
  const categories = useLedgerQuery((database) => listCategories(database), []);

  const original = transaction.data;
  const all: Category[] = categories.data ?? [];

  // Two empty parts to begin with, the first carrying the original's category.
  if (original && !seeded) {
    setSeeded(true);
    setParts([
      { key: 'a', cents: 0, categoryId: original.category_id },
      { key: 'b', cents: 0, categoryId: null },
    ]);
    setActiveKey('a');
  }

  const totalCents = original ? Math.abs(original.amount_cents) : 0;
  const assigned = parts.reduce((sum, part) => sum + part.cents, 0);
  const remainder = totalCents - assigned;
  const ready =
    remainder === 0 && parts.length >= 2 && parts.every((part) => part.cents > 0);

  function update(key: string, change: (part: Part) => Part) {
    setParts((current) => current.map((part) => (part.key === key ? change(part) : part)));
  }

  function addPart() {
    const key = Math.random().toString(36).slice(2, 8);
    setParts((current) => [...current, { key, cents: 0, categoryId: null }]);
    setActiveKey(key);
  }

  async function save() {
    if (!ready || !original || saving) return;
    setSaving(true);
    const sign = Math.sign(original.amount_cents);
    try {
      await splitTransaction(
        db,
        id,
        parts.map((part) => ({
          amount_cents: sign * part.cents,
          category_id: part.categoryId,
        })),
      );
      invalidate();
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Could not split it', (error as Error).message);
    }
  }

  if (!original) {
    return (
      <Screen>
        <SheetHeader title="Split" accent={Line.amber} onClose={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <SheetHeader
        title="Split it up"
        accent={Line.amber}
        onClose={() => router.back()}
        action={{ label: 'Add part', onPress: addPart }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {original.description || 'No description'}
          </Text>
          <Money cents={original.amount_cents} variant="amount" />
        </View>

        <View style={styles.remainder}>
          <Text variant="station" tone="muted">
            {remainder === 0 ? 'All of it accounted for' : 'Still to place'}
          </Text>
          <Text
            variant="display"
            color={remainder === 0 ? theme.onGround.green : remainder < 0 ? theme.onGround.scarlet : undefined}
            tone={remainder === 0 ? undefined : 'ink'}>
            {money.formatAbs(remainder)}
          </Text>
          {remainder < 0 ? (
            <Text variant="caption" color={theme.onGround.scarlet}>
              That is more than the original. Take some back off a part.
            </Text>
          ) : null}
        </View>

        {parts.map((part, index) => (
          <View key={part.key} style={styles.part}>
            <Pressable
              onPress={() => setActiveKey(part.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeKey === part.key }}
              style={[
                styles.partHead,
                {
                  borderColor: activeKey === part.key ? theme.ink : theme.rule,
                  backgroundColor: activeKey === part.key ? theme.raised : 'transparent',
                },
              ]}>
              <Text variant="station" tone="muted">
                {`Part ${index + 1}`}
              </Text>
              <Money cents={part.cents} variant="amount" colorIncome={false} signDisplay="never" />
            </Pressable>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
              accessibilityRole="radiogroup">
              {all.map((category) => (
                <Plate
                  key={category.id}
                  style={styles.categoryPlate}
                  variant="label"
                  numberOfLines={1}
                  accent={category.color}
                  label={category.name}
                  active={part.categoryId === category.id}
                  leading={
                    <CategoryRoundel
                      size={22}
                      color={category.color}
                      icon={category.icon}
                      name={category.name}
                    />
                  }
                  onPress={() => update(part.key, (current) => ({ ...current, categoryId: category.id }))}
                />
              ))}
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.dock, { borderTopColor: theme.rule }]}>
        <Text variant="caption" tone="faint" style={styles.dockLabel}>
          {activeKey
            ? `Typing into part ${parts.findIndex((part) => part.key === activeKey) + 1}`
            : 'Pick a part to type into'}
        </Text>
        <Keypad
          onDigit={(digits) => {
            if (!activeKey) return;
            update(activeKey, (current) => {
              const next = Number(`${current.cents}${digits}`);
              return next <= totalCents * 10 ? { ...current, cents: next } : current;
            });
          }}
          onBackspace={() => {
            if (!activeKey) return;
            update(activeKey, (current) => ({ ...current, cents: Math.floor(current.cents / 10) }));
          }}
        />
        <Button
          label={saving ? 'Splitting…' : 'Save the split'}
          onPress={save}
          disabled={!ready || saving}
          accessibilityHint={ready ? undefined : 'Every part needs an amount, and they must add up to the original'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.lg,
    paddingBottom: Space.xxl,
    gap: Space.xl,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingHorizontal: Space.lg,
  },
  remainder: {
    paddingHorizontal: Space.lg,
    gap: Space.xs,
  },
  part: {
    gap: Space.sm,
  },
  partHead: {
    marginHorizontal: Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TouchTarget,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  rail: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  categoryPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  dock: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  dockLabel: {
    textAlign: 'center',
  },
});
