import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CategoryRail } from '@/components/category-rail';
import { DayPicker } from '@/components/day-picker';
import { TextField } from '@/components/field';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Keypad } from '@/components/transit/keypad';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { listAccounts } from '@/db/repositories/accounts';
import { listCategories } from '@/db/repositories/categories';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  type TemplateWithCategory,
} from '@/db/repositories/templates';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from '@/db/repositories/transactions';
import type { Category, DateOnly } from '@/db/types';
import { toDateOnly } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

type Direction = 'out' | 'in';

/**
 * The entry path — the product.
 *
 * Amount first, on a keypad, because that is the only field the person at the
 * till definitely knows. Everything below it has a working default, so a
 * complete expense is three taps: digits, line, save.
 */
export default function EntryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateLedger();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [direction, setDirection] = useState<Direction>('out');
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState<DateOnly>(() => toDateOnly(new Date()));
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  const categories = useLedgerQuery((database) => listCategories(database), []);
  const templates = useLedgerQuery((database) => listTemplates(database), []);
  const accounts = useLedgerQuery((database) => listAccounts(database), []);
  const existing = useLedgerQuery(
    (database) => (id ? getTransaction(database, id) : Promise.resolve(null)),
    [id],
  );

  // Prefill once when editing, during render rather than in an effect, so the
  // first painted frame already carries the transaction's own values.
  const loaded = existing.data;
  if (loaded && prefilled !== loaded.id) {
    setPrefilled(loaded.id);
    setDirection(loaded.amount_cents >= 0 ? 'in' : 'out');
    setCents(Math.abs(loaded.amount_cents));
    setCategoryId(loaded.category_id);
    setDate(loaded.date);
    setDescription(loaded.description);
    setNotes(loaded.notes ?? '');
    setAccountId(loaded.account_id);
  }

  // Only offered when there is a choice to make. One account is the normal case
  // and a picker with a single option is furniture.
  const accountList = accounts.data ?? [];
  const showAccounts = accountList.length > 1;

  const all: Category[] = categories.data ?? [];
  const visible = all.filter((category) =>
    direction === 'in' ? category.kind === 'income' : category.kind === 'expense',
  );
  const accent = visible.find((category) => category.id === categoryId)?.color ?? Line.scarlet;

  function pushDigits(digits: string) {
    const next = Number(`${cents}${digits}`);
    // 21 474 836.47 in the chosen currency is far past any grocery run and
    // keeps the value inside a safe integer for the whole ledger's SUMs.
    if (next > 2_147_483_647) return;
    setCents(next);
  }

  async function save() {
    if (cents <= 0 || saving) return;
    setSaving(true);
    const amount_cents = direction === 'out' ? -cents : cents;
    try {
      if (id) {
        await updateTransaction(db, id, {
          amount_cents,
          date,
          description: description.trim(),
          category_id: categoryId,
          notes: notes.trim() || null,
          ...(accountId ? { account_id: accountId } : {}),
        });
      } else {
        await createTransaction(db, {
          amount_cents,
          date,
          description: description.trim(),
          category_id: categoryId,
          notes: notes.trim() || null,
          // Undefined rather than null: createTransaction resolves the default,
          // and null would be a deliberate "no account", which cannot happen.
          account_id: accountId ?? undefined,
        });
      }
      haptics.saved();
      invalidate();
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Could not save', (error as Error).message);
    }
  }

  /** Fills the sheet from a saved quick entry, leaving the day as today. */
  function applyTemplate(template: TemplateWithCategory) {
    setDirection(template.amount_cents >= 0 ? 'in' : 'out');
    setCents(Math.abs(template.amount_cents));
    setCategoryId(template.category_id);
    setDescription(template.description);
  }

  function saveTemplate() {
    if (cents <= 0) return;
    const label = description.trim() || money.formatAbs(cents);
    Alert.alert(
      'Save as a quick entry?',
      `"${label}" will sit at the top of this sheet so the same amount is one tap next time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            await createTemplate(db, {
              label,
              amount_cents: direction === 'out' ? -cents : cents,
              category_id: categoryId,
              description: description.trim(),
            });
            haptics.saved();
            invalidate();
          },
        },
      ],
    );
  }

  function confirmRemoveTemplate(template: TemplateWithCategory) {
    Alert.alert(`Remove "${template.label}"?`, 'The transactions it created stay in the ledger.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteTemplate(db, template.id);
          invalidate();
        },
      },
    ]);
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert('Delete this transaction?', 'It will be removed from every month and total.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, id);
          invalidate();
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <SheetHeader
        title={id ? 'Edit transaction' : direction === 'out' ? 'Money out' : 'Money in'}
        accent={accent}
        onClose={() => router.back()}
        action={id ? { label: 'Delete', onPress: confirmDelete, destructive: true } : undefined}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {!id && (templates.data ?? []).length > 0 ? (
          <View style={styles.quick}>
            <Text variant="station" tone="muted" style={styles.railLabel}>
              Quick entries
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}>
              {(templates.data ?? []).map((template) => (
                <Pressable
                  key={template.id}
                  onPress={() => applyTemplate(template)}
                  onLongPress={() => confirmRemoveTemplate(template)}
                  accessibilityRole="button"
                  accessibilityLabel={`${template.label}, ${money.format(template.amount_cents)}`}
                  accessibilityHint="Long press to remove this quick entry"
                  style={({ pressed }) => [
                    styles.quickChip,
                    {
                      borderColor: template.category_color ?? theme.rule,
                      backgroundColor: pressed ? theme.raised : 'transparent',
                    },
                  ]}>
                  <Text variant="label" numberOfLines={1}>
                    {template.label}
                  </Text>
                  <Text variant="amountSmall" tone="muted">
                    {money.formatAbs(template.amount_cents)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.directions} accessibilityRole="radiogroup">
          <Plate
            style={styles.plate}
            label="Out"
            active={direction === 'out'}
            onPress={() => setDirection('out')}
          />
          <Plate
            style={styles.plate}
            label="In"
            active={direction === 'in'}
            onPress={() => setDirection('in')}
          />
        </View>

        <View style={styles.readout} accessibilityRole="summary">
          <Text
            variant="display"
            tone={cents === 0 ? 'faint' : 'ink'}
            accessibilityLabel={`Amount ${money.formatAbs(cents)}`}>
            {money.formatAbs(cents)}
          </Text>
          {!id && cents > 0 ? (
            <Pressable onPress={saveTemplate} accessibilityRole="button" hitSlop={8}>
              <Text variant="station" color={theme.onGround.cobalt}>
                Save as quick entry
              </Text>
            </Pressable>
          ) : null}
        </View>

        {visible.length > 0 ? (
          <View style={styles.rail}>
            <Text variant="station" tone="muted" style={styles.railLabel}>
              Line
            </Text>
            <CategoryRail categories={visible} selectedId={categoryId} onSelect={setCategoryId} />
          </View>
        ) : null}

        {showAccounts ? (
          <View style={styles.rail}>
            <Text variant="station" tone="muted" style={styles.railLabel}>
              Account
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accountRow}
              accessibilityRole="radiogroup">
              {accountList.map((account) => (
                <Plate
                  key={account.id}
                  style={styles.accountPlate}
                  variant="label"
                  numberOfLines={1}
                  accent={accent}
                  label={account.name}
                  active={
                    accountId === account.id ||
                    (accountId === null && account.id === accountList[0]?.id)
                  }
                  onPress={() => setAccountId(account.id)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/*
          Ordered by how often each is touched, because the keypad is docked
          over the bottom of this list: whatever ends up under the fold should
          be the field nobody fills in at a till.
        */}
        <View style={styles.fields}>
          <DayPicker value={date} onChange={setDate} accent={accent} />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Where did it go?"
            returnKeyType="done"
            autoCapitalize="sentences"
          />
          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            multiline
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.dock,
          { borderTopColor: theme.rule, paddingBottom: Math.max(insets.bottom, Space.lg) },
        ]}>
        <Keypad onDigit={pushDigits} onBackspace={() => setCents(Math.floor(cents / 10))} />
        <Button
          label={id ? 'Save changes' : direction === 'out' ? 'Log this spend' : 'Log this income'}
          onPress={save}
          disabled={cents <= 0 || saving}
          accessibilityHint={cents <= 0 ? 'Enter an amount first' : undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: Space.lg,
    // Clears the docked keypad, which sits over the scroll rather than in it.
    paddingBottom: Space.xxl,
    gap: Space.xl,
  },
  directions: {
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
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  readout: {
    paddingHorizontal: Space.lg,
    gap: Space.sm,
  },
  quick: {
    gap: Space.sm,
  },
  quickRow: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  quickChip: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.plate,
    borderWidth: Stroke.tick,
    maxWidth: 200,
    gap: 2,
  },
  rail: {
    gap: Space.sm,
  },
  accountRow: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  accountPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  railLabel: {
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
