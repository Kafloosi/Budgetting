import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DayPicker } from '@/components/day-picker';
import { TextField } from '@/components/field';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Keypad } from '@/components/transit/keypad';
import { Line, LineOrder, Space, Stroke, TouchTarget } from '@/constants/theme';
import { createGoal, deleteGoal, getGoal, updateGoal } from '@/db/repositories/goals';
import type { DateOnly } from '@/db/types';
import { shiftDaysByMonth, toDateOnly } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

export default function GoalScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateLedger();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [name, setName] = useState('');
  const [cents, setCents] = useState(0);
  const [color, setColor] = useState<string>(Line.teal);
  const [deadline, setDeadline] = useState<DateOnly | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  const existing = useLedgerQuery(
    (database) => (id ? getGoal(database, id) : Promise.resolve(null)),
    [id],
  );

  const loaded = existing.data;
  if (loaded && prefilled !== loaded.id) {
    setPrefilled(loaded.id);
    setName(loaded.name);
    setCents(loaded.target_cents);
    setColor(loaded.color);
    setDeadline(loaded.deadline);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name the goal so you know what you are saving for.');
      return;
    }
    if (cents <= 0) {
      setError('Set a target above zero.');
      return;
    }

    if (id) {
      await updateGoal(db, id, { name: trimmed, target_cents: cents, color, deadline });
    } else {
      await createGoal(db, { name: trimmed, target_cents: cents, color, deadline });
    }
    haptics.saved();
    invalidate();
    router.back();
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert('Close this goal?', 'Whatever you had set aside stops being tracked here.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: async () => {
          await deleteGoal(db, id);
          haptics.removed();
          invalidate();
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <SheetHeader
        title={id ? 'Edit goal' : 'New goal'}
        accent={color}
        onClose={() => router.back()}
        action={id ? { label: 'Delete', onPress: confirmDelete, destructive: true } : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TextField
          label="Goal"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          placeholder="New laptop, holiday, buffer…"
          autoCapitalize="sentences"
          returnKeyType="done"
        />

        <View style={styles.readout}>
          <Text variant="station" tone="muted">
            Target
          </Text>
          <Text variant="display" tone={cents === 0 ? 'faint' : 'ink'}>
            {money.formatAbs(cents)}
          </Text>
        </View>

        <View style={styles.group}>
          <Text variant="station" tone="muted">
            Line colour
          </Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {LineOrder.map((candidate) => (
              <Pressable
                key={candidate}
                onPress={() => setColor(candidate)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === candidate }}
                style={styles.swatchHit}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: candidate,
                      borderColor: color === candidate ? theme.ink : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <View style={styles.deadlineHead}>
            <Text variant="station" tone="muted">
              Deadline
            </Text>
            <Pressable
              onPress={() =>
                setDeadline(deadline ? null : shiftDaysByMonth(toDateOnly(new Date()), 6))
              }
              accessibilityRole="button"
              hitSlop={8}>
              <Text variant="station" color={theme.onGround.cobalt}>
                {deadline ? 'Remove' : 'Add one'}
              </Text>
            </Pressable>
          </View>
          {deadline ? (
            <DayPicker value={deadline} onChange={setDeadline} accent={color} />
          ) : (
            <Text variant="caption" tone="muted">
              Without a deadline the goal just tracks progress. With one, Fare works out what to set
              aside each month.
            </Text>
          )}
        </View>

        {error ? (
          <Text variant="caption" color={theme.onGround.scarlet}>
            {error}
          </Text>
        ) : null}
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
            setError(null);
          }}
          onBackspace={() => setCents(Math.floor(cents / 10))}
        />
        <Button label={id ? 'Save goal' : 'Open the goal'} onPress={save} disabled={cents <= 0} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.lg,
    gap: Space.xl,
  },
  readout: {
    gap: Space.xs,
  },
  group: {
    gap: Space.sm,
  },
  swatches: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  swatchHit: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
  },
  deadlineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dock: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    gap: Space.md,
  },
});
