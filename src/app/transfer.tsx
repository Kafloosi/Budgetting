import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DayPicker } from '@/components/day-picker';
import { TextField } from '@/components/field';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Keypad } from '@/components/transit/keypad';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { listAccounts } from '@/db/repositories/accounts';
import { createTransfer } from '@/db/repositories/transfers';
import type { DateOnly } from '@/db/types';
import { toDateOnly } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

/**
 * Moving your own money.
 *
 * Not an expense and not income — the same money in a different place. It is
 * recorded as two rows that cancel, so the month's spending, every budget and
 * every forecast are untouched by it, and only the two balances move.
 *
 * That is stated on the screen, because a budgeting app that counted a transfer to
 * savings as spending would be wrong in the most discouraging possible direction.
 */
export default function TransferScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateLedger();

  const [cents, setCents] = useState(0);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [date, setDate] = useState<DateOnly>(() => toDateOnly(new Date()));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const accounts = useLedgerQuery((database) => listAccounts(database), []);
  const all = accounts.data ?? [];

  const from = fromId ?? all[0]?.id ?? null;
  const to = toId ?? all.find((account) => account.id !== from)?.id ?? null;
  const ready = cents > 0 && from !== null && to !== null && from !== to;

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await createTransfer(db, {
        fromAccountId: from,
        toAccountId: to,
        amountCents: cents,
        date,
        description: description.trim(),
      });
      haptics.saved();
      invalidate();
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Could not move it', (error as Error).message);
    }
  }

  if (all.length < 2) {
    return (
      <Screen>
        <SheetHeader title="Move money" accent={Line.cobalt} onClose={() => router.back()} />
        <View style={styles.needTwo}>
          <Text variant="body" tone="muted">
            A transfer needs two accounts. Add another one first, then money can move
            between them.
          </Text>
          <Button label="Add an account" onPress={() => router.replace('/account')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <SheetHeader title="Move money" accent={Line.cobalt} onClose={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.readout}>
          <Text variant="station" tone="muted">
            Amount
          </Text>
          <Text variant="display" tone={cents === 0 ? 'faint' : 'ink'}>
            {money.formatAbs(cents)}
          </Text>
        </View>

        <AccountRow
          label="Out of"
          accounts={all}
          selectedId={from}
          onSelect={(next) => {
            setFromId(next);
            // Picking the account the money is already going to would make the
            // transfer meaningless, so the other side steps aside.
            if (next === to) setToId(all.find((account) => account.id !== next)?.id ?? null);
          }}
        />

        <AccountRow
          label="Into"
          accounts={all}
          selectedId={to}
          onSelect={(next) => {
            setToId(next);
            if (next === from) setFromId(all.find((account) => account.id !== next)?.id ?? null);
          }}
        />

        <View style={styles.fields}>
          <DayPicker value={date} onChange={setDate} accent={Line.cobalt} />
          <TextField
            label="Note"
            value={description}
            onChangeText={setDescription}
            placeholder="Moving to savings"
            autoCapitalize="sentences"
            returnKeyType="done"
          />
        </View>

        <Text variant="caption" tone="muted" style={styles.explain}>
          A transfer is not spending. It leaves both balances correct and every budget,
          total and forecast exactly as they were.
        </Text>
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
          label={saving ? 'Moving…' : 'Move it'}
          onPress={save}
          disabled={!ready || saving}
          accessibilityHint={ready ? undefined : 'Enter an amount and pick two accounts'}
        />
      </View>
    </Screen>
  );
}

function AccountRow({
  label,
  accounts,
  selectedId,
  onSelect,
}: {
  label: string;
  accounts: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text variant="station" tone="muted" style={styles.groupLabel}>
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.plates}
        accessibilityRole="radiogroup">
        {accounts.map((account) => (
          <Plate
            key={account.id}
            style={styles.plate}
            variant="label"
            numberOfLines={1}
            accent={Line.cobalt}
            label={account.name}
            active={selectedId === account.id}
            onPress={() => onSelect(account.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.lg,
    paddingBottom: Space.xxl,
    gap: Space.xl,
  },
  readout: {
    paddingHorizontal: Space.lg,
    gap: Space.sm,
  },
  group: {
    gap: Space.sm,
  },
  groupLabel: {
    paddingHorizontal: Space.lg,
  },
  plates: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  fields: {
    paddingHorizontal: Space.lg,
    gap: Space.lg,
  },
  explain: {
    paddingHorizontal: Space.lg,
  },
  dock: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    gap: Space.md,
  },
  needTwo: {
    padding: Space.xl,
    gap: Space.lg,
  },
});
