import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CategoryRail } from '@/components/category-rail';
import { DayPicker } from '@/components/day-picker';
import { TextField } from '@/components/field';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Keypad } from '@/components/transit/keypad';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { listCategories } from '@/db/repositories/categories';
import {
  FREQUENCY_LABELS,
  createRecurring,
  deleteRecurring,
  getRecurring,
  updateRecurring,
} from '@/db/repositories/recurring';
import type { Category, DateOnly, RecurringFrequency } from '@/db/types';
import { toDateOnly } from '@/db/util';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

type Direction = 'out' | 'in';

const FREQUENCIES: RecurringFrequency[] = ['weekly', 'biweekly', 'monthly'];

/**
 * A scheduled entry.
 *
 * The anchor date is the first run, and everything after it is derived — so
 * "the 28th of every month" is expressed by anchoring on a 28th rather than by
 * a separate day-of-month field that could disagree with it.
 */
export default function RecurringRuleScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateLedger();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [direction, setDirection] = useState<Direction>('out');
  const [cents, setCents] = useState(0);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [anchor, setAnchor] = useState<DateOnly>(() => toDateOnly(new Date()));
  const [prefilled, setPrefilled] = useState<string | null>(null);

  const categories = useLedgerQuery((database) => listCategories(database), []);
  const existing = useLedgerQuery(
    (database) => (id ? getRecurring(database, id) : Promise.resolve(null)),
    [id],
  );

  const loaded = existing.data;
  if (loaded && prefilled !== loaded.id) {
    setPrefilled(loaded.id);
    setDirection(loaded.amount_cents >= 0 ? 'in' : 'out');
    setCents(Math.abs(loaded.amount_cents));
    setDescription(loaded.description);
    setCategoryId(loaded.category_id);
    setFrequency(loaded.frequency);
    setAnchor(loaded.anchor_date);
  }

  const all: Category[] = categories.data ?? [];
  const visible = all.filter((category) =>
    direction === 'in' ? category.kind === 'income' : category.kind === 'expense',
  );
  const accent = visible.find((category) => category.id === categoryId)?.color ?? Line.violet;

  async function save() {
    if (cents <= 0) return;
    const amount_cents = direction === 'out' ? -cents : cents;
    const input = {
      amount_cents,
      description: description.trim(),
      category_id: categoryId,
      frequency,
      anchor_date: anchor,
    };

    if (id) {
      await updateRecurring(db, id, input);
    } else {
      await createRecurring(db, input);
    }
    haptics.saved();
    invalidate();
    router.back();
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(
      'Take this off the timetable?',
      'Entries it already created stay in the ledger — they are money that really moved.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Stop it',
          style: 'destructive',
          onPress: async () => {
            await deleteRecurring(db, id);
            haptics.removed();
            invalidate();
            router.back();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SheetHeader
        title={id ? 'Edit schedule' : 'New scheduled entry'}
        accent={accent}
        onClose={() => router.back()}
        action={id ? { label: 'Stop', onPress: confirmDelete, destructive: true } : undefined}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.plates} accessibilityRole="radiogroup">
          <Plate label="Out" active={direction === 'out'} onPress={() => setDirection('out')} />
          <Plate label="In" active={direction === 'in'} onPress={() => setDirection('in')} />
        </View>

        <View style={styles.readout}>
          <Text variant="display" tone={cents === 0 ? 'faint' : 'ink'}>
            {money.formatAbs(cents)}
          </Text>
        </View>

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            How often
          </Text>
          <View style={styles.plates} accessibilityRole="radiogroup">
            {FREQUENCIES.map((candidate) => (
              <Plate
                key={candidate}
                label={FREQUENCY_LABELS[candidate].replace('Every ', '')}
                active={frequency === candidate}
                onPress={() => setFrequency(candidate)}
              />
            ))}
          </View>
        </View>

        {visible.length > 0 ? (
          <View style={styles.group}>
            <Text variant="station" tone="muted" style={styles.groupLabel}>
              Line
            </Text>
            <CategoryRail categories={visible} selectedId={categoryId} onSelect={setCategoryId} />
          </View>
        ) : null}

        <View style={styles.fields}>
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Rent, salary, Netflix…"
            autoCapitalize="sentences"
            returnKeyType="done"
          />
          <DayPicker value={anchor} onChange={setAnchor} accent={accent} />
          <Text variant="caption" tone="muted">
            {`First run on this day, then ${FREQUENCY_LABELS[frequency].toLowerCase()}. Anything due while the app was closed is caught up on the next open.`}
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
            const next = Number(`${cents}${digits}`);
            if (next <= 2_147_483_647) setCents(next);
          }}
          onBackspace={() => setCents(Math.floor(cents / 10))}
        />
        <Button
          label={id ? 'Save schedule' : 'Add to the timetable'}
          onPress={save}
          disabled={cents <= 0}
        />
      </View>
    </Screen>
  );
}

function Plate({
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingVertical: Space.lg,
    gap: Space.xl,
  },
  plates: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  plate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.sm,
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
    paddingHorizontal: Space.lg,
  },
  group: {
    gap: Space.sm,
  },
  groupLabel: {
    paddingHorizontal: Space.lg,
  },
  fields: {
    paddingHorizontal: Space.lg,
    gap: Space.lg,
  },
  dock: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    gap: Space.md,
  },
});
