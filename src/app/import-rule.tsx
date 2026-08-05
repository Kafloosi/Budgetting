import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CategoryRail } from '@/components/category-rail';
import { TextField } from '@/components/field';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { listCategories } from '@/db/repositories/categories';
import {
  applyRulesToUncategorised,
  createImportRule,
  deleteImportRule,
  getImportRule,
  updateImportRule,
} from '@/db/repositories/import-rules';
import type { RuleMatchType } from '@/db/types';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';

/** Priority is two states, not a number — a spinner would invite fiddling. */
const FIRST_PRIORITY = 100;

const MATCH_LABELS: Record<RuleMatchType, string> = {
  contains: 'Contains',
  starts_with: 'Starts with',
  equals: 'Is exactly',
};

const MATCH_ORDER: RuleMatchType[] = ['contains', 'starts_with', 'equals'];

/**
 * One line of the timetable.
 *
 * The pattern is matched against the bank's own wording after both sides are
 * flattened — case and spacing are not differences — so "ALBERT HEIJN 1234" is
 * caught by "albert heijn" without anyone thinking about it.
 */
export default function ImportRuleScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { id, pattern: initialPattern, categoryId: initialCategory } =
    useLocalSearchParams<{ id?: string; pattern?: string; categoryId?: string }>();

  const [pattern, setPattern] = useState(initialPattern ?? '');
  const [matchType, setMatchType] = useState<RuleMatchType>('contains');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategory ?? null);
  const [first, setFirst] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  const categories = useLedgerQuery((database) => listCategories(database), []);
  const existing = useLedgerQuery(
    (database) => (id ? getImportRule(database, id) : Promise.resolve(null)),
    [id],
  );

  const loaded = existing.data;
  if (loaded && prefilled !== loaded.id) {
    setPrefilled(loaded.id);
    setPattern(loaded.pattern);
    setMatchType(loaded.match_type);
    setCategoryId(loaded.category_id);
    setFirst(loaded.priority > 0);
  }

  const accent =
    (categories.data ?? []).find((category) => category.id === categoryId)?.color ?? Line.teal;

  async function save() {
    const trimmed = pattern.trim();
    if (!trimmed) {
      setError('Type a few words from the payee as the bank writes it.');
      return;
    }
    if (!categoryId) {
      setError('Pick the line this payee travels on.');
      return;
    }

    const input = {
      pattern: trimmed,
      match_type: matchType,
      category_id: categoryId,
      priority: first ? FIRST_PRIORITY : 0,
    };

    if (id) {
      await updateImportRule(db, id, input);
    } else {
      await createImportRule(db, input);
    }

    // Saving a rule clears the backlog it describes, rather than only affecting
    // statements not imported yet.
    const filed = await applyRulesToUncategorised(db);
    invalidate();

    if (filed > 0) {
      Alert.alert(
        'Rule saved',
        `${filed} ${filed === 1 ? 'transaction was' : 'transactions were'} filed by it straight away.`,
        [{ text: 'Good', onPress: () => router.back() }],
      );
      return;
    }
    router.back();
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(
      'Delete this rule?',
      'Transactions it has already filed keep their category. Future imports stop being sorted by it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteImportRule(db, id);
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
        title={id ? 'Edit rule' : 'New rule'}
        accent={accent}
        onClose={() => router.back()}
        action={id ? { label: 'Delete', onPress: confirmDelete, destructive: true } : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TextField
          label="When the description"
          value={pattern}
          onChangeText={(value) => {
            setPattern(value);
            setError(null);
          }}
          placeholder="albert heijn"
          hint="Capitals and extra spaces do not matter."
          error={error ?? undefined}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            Match
          </Text>
          <View style={styles.plates} accessibilityRole="radiogroup">
            {MATCH_ORDER.map((candidate) => (
              <Plate
                key={candidate}
                style={styles.plate}
                numberOfLines={1}
                label={MATCH_LABELS[candidate]}
                active={matchType === candidate}
                onPress={() => setMatchType(candidate)}
              />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            File it as
          </Text>
          <CategoryRail
            categories={categories.data ?? []}
            selectedId={categoryId}
            onSelect={(next) => {
              setCategoryId(next);
              setError(null);
            }}
          />
        </View>

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            Order
          </Text>
          <View style={styles.plates} accessibilityRole="radiogroup">
            <Plate
              style={styles.plate}
              numberOfLines={1}
              label="Normal"
              active={!first}
              onPress={() => setFirst(false)}
            />
            <Plate
              style={styles.plate}
              numberOfLines={1}
              label="Always first"
              active={first}
              onPress={() => setFirst(true)}
            />
          </View>
          <Text variant="caption" tone="muted" style={styles.groupLabel}>
            Rules are tried longest pattern first, so a more specific payee already
            beats a general one. Put a rule first only when you need it to win anyway.
          </Text>
        </View>

        <Button label={id ? 'Save rule' : 'Add rule'} onPress={save} style={styles.save} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.lg,
    gap: Space.xl,
  },
  group: {
    gap: Space.sm,
  },
  groupLabel: {
    paddingHorizontal: Space.lg,
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
  save: {
    marginHorizontal: Space.lg,
  },
});
