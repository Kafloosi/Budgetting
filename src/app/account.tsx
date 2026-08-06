import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/field';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KINDS,
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
  type AccountKind,
} from '@/db/repositories/accounts';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useSettings } from '@/providers/settings';

/**
 * One account.
 *
 * Currency is shown but fixed to the ledger's own, because nothing in the app
 * converts between currencies yet and an account quietly holding a different one
 * would make every total a lie. The column stays per-account for the day that
 * changes; see PRODUCT.md's open question.
 */
export default function AccountScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { settings } = useSettings();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('checking');
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  const existing = useLedgerQuery(
    (database) => (id ? getAccount(database, id) : Promise.resolve(null)),
    [id],
  );
  const accounts = useLedgerQuery((database) => listAccounts(database), []);

  const loaded = existing.data;
  if (loaded && prefilled !== loaded.id) {
    setPrefilled(loaded.id);
    setName(loaded.name);
    if ((ACCOUNT_KINDS as readonly string[]).includes(loaded.kind)) {
      setKind(loaded.kind as AccountKind);
    }
  }

  const others = (accounts.data ?? []).filter((account) => account.id !== id);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the account a name so you can tell it apart on the keypad.');
      return;
    }
    if (id) {
      await updateAccount(db, id, { name: trimmed, kind });
    } else {
      await createAccount(db, { name: trimmed, kind, currency: settings.currency });
    }
    invalidate();
    router.back();
  }

  /**
   * Closing an account moves its transactions rather than losing them — the money
   * was really spent, and the label going away must not take the history with it.
   * The last account cannot be closed, because every row needs somewhere to be.
   */
  function confirmDelete() {
    if (!id) return;

    if (others.length === 0) {
      Alert.alert(
        'This is the only account',
        'Every transaction has to belong to an account, so this one cannot be closed. Make another first.',
      );
      return;
    }

    const target = others[0];
    Alert.alert(
      `Close ${name}?`,
      `Everything logged on it moves to ${target.name}. No transaction is deleted.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: `Move to ${target.name}`,
          style: 'destructive',
          onPress: async () => {
            await deleteAccount(db, id, target.id);
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
        title={id ? 'Edit account' : 'New account'}
        accent={Line.cobalt}
        onClose={() => router.back()}
        action={id ? { label: 'Close', onPress: confirmDelete, destructive: true } : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          placeholder="Current account, Cash, Savings…"
          error={error ?? undefined}
          autoCapitalize="words"
          returnKeyType="done"
          style={styles.field}
        />

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            Kind
          </Text>
          <View style={styles.plates} accessibilityRole="radiogroup">
            {ACCOUNT_KINDS.map((candidate) => (
              <Plate
                key={candidate}
                style={styles.plate}
                variant="label"
                numberOfLines={1}
                label={ACCOUNT_KIND_LABELS[candidate]}
                active={kind === candidate}
                onPress={() => setKind(candidate)}
              />
            ))}
          </View>
          <Text variant="caption" tone="muted" style={styles.groupLabel}>
            {`Held in ${settings.currency}, like the rest of the ledger.`}
          </Text>
        </View>

        <Button label={id ? 'Save account' : 'Add account'} onPress={save} style={styles.field} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.lg,
    gap: Space.xl,
  },
  field: {
    marginHorizontal: Space.lg,
  },
  group: {
    gap: Space.sm,
  },
  groupLabel: {
    paddingHorizontal: Space.lg,
  },
  plates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
});
