import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CategoryRail } from '@/components/category-rail';
import { EmptyState } from '@/components/empty-state';
import { TextField } from '@/components/field';
import { Money } from '@/components/money';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconTick } from '@/components/transit/icons';
import { StationBullet } from '@/components/transit/roundel';
import { Line, Radius, Space, Stroke } from '@/constants/theme';
import { listCategories } from '@/db/repositories/categories';
import { applyRulesToUncategorised, createImportRule, suggestPattern } from '@/db/repositories/import-rules';
import { listTransactions, updateTransaction } from '@/db/repositories/transactions';
import type { TransactionWithCategory } from '@/db/repositories/transactions';
import type { Category } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

/** What the rule offer is currently proposing, once a row has been filed. */
interface Offer {
  categoryId: string;
  categoryName: string;
  pattern: string;
}

/**
 * The rows a statement could not file on its own.
 *
 * Import fills in whatever the rules already know. What is left is here, as a
 * queue you work down — tap a row, pick its line, and it leaves. The count in
 * the header is the point: it only goes down, so the pile is visibly finite.
 *
 * Filing by hand is also the best moment to catch a rule, because you are
 * already looking at the payee. So the row that just left offers to become one.
 */
export default function TriageScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const theme = useTheme();
  const money = useMoney();
  const invalidate = useInvalidateLedger();

  const [openId, setOpenId] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const waiting = useLedgerQuery(
    (database) => listTransactions(database, { uncategorised: true, limit: 300 }),
    [],
  );
  const categories = useLedgerQuery((database) => listCategories(database), []);

  const rows = waiting.data ?? [];
  const lines = categories.data ?? [];

  async function file(row: TransactionWithCategory, categoryId: string) {
    const category = lines.find((candidate) => candidate.id === categoryId);
    await updateTransaction(db, row.id, { category_id: categoryId });
    setOpenId(null);
    setNote(null);
    // The row is about to leave the list, so the rule offer cannot live on it.
    setOffer({
      categoryId,
      categoryName: category?.name ?? 'that line',
      pattern: suggestPattern(row.description),
    });
    invalidate();
  }

  async function saveRule() {
    if (!offer) return;
    const trimmed = offer.pattern.trim();
    if (!trimmed) return;

    await createImportRule(db, {
      pattern: trimmed,
      match_type: 'contains',
      category_id: offer.categoryId,
    });
    const filed = await applyRulesToUncategorised(db);
    setOffer(null);
    setNote(
      filed > 0
        ? `Rule saved. ${filed} more ${filed === 1 ? 'row' : 'rows'} filed by it.`
        : 'Rule saved. Future statements will use it.',
    );
    invalidate();
  }

  return (
    <Screen>
      <SheetHeader
        title="To file"
        accent={Line.amber}
        leading="back"
        onClose={() => router.back()}
        action={{ label: 'Rules', onPress: () => router.push('/import-rules') }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <EmptyState
            accent={Line.amber}
            title="Nothing to file"
            body="Every transaction in the ledger has a line. Imported rows land here when no rule recognises the payee."
            action={{ label: 'Import a statement', onPress: () => router.push('/import') }}
          />
        ) : (
          <>
            <Text variant="caption" tone="muted" style={styles.count}>
              {`${rows.length} ${rows.length === 1 ? 'row has' : 'rows have'} no line yet. Tap one to give it a line.`}
            </Text>

            <View style={styles.list}>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  open={openId === row.id}
                  locale={money.locale}
                  onToggle={() => {
                    setOpenId(openId === row.id ? null : row.id);
                    setNote(null);
                  }}
                  categories={lines}
                  onFile={(categoryId) => file(row, categoryId)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {note ? (
        <View style={[styles.dock, { borderTopColor: theme.rule, backgroundColor: theme.raised }]}>
          <IconTick size={20} color={theme.onGround.green} />
          <Text variant="caption" tone="muted" style={styles.noteText}>
            {note}
          </Text>
        </View>
      ) : null}

      {offer ? (
        <View style={[styles.dock, { borderTopColor: theme.rule, backgroundColor: theme.raised }]}>
          <View style={styles.offerBody}>
            <Text variant="station" tone="muted">
              {`Always file this as ${offer.categoryName}?`}
            </Text>
            <TextField
              label="When the description contains"
              value={offer.pattern}
              onChangeText={(value) => setOffer({ ...offer, pattern: value })}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveRule}
            />
            <View style={styles.offerActions}>
              <Button
                label="Not now"
                variant="quiet"
                showArrow={false}
                onPress={() => setOffer(null)}
                style={styles.offerAction}
              />
              <Button
                label="Remember it"
                onPress={saveRule}
                disabled={offer.pattern.trim().length === 0}
                style={styles.offerAction}
              />
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function Row({
  row,
  open,
  locale,
  onToggle,
  categories,
  onFile,
}: {
  row: TransactionWithCategory;
  open: boolean;
  locale: string;
  onToggle: () => void;
  categories: Category[];
  onFile: (categoryId: string) => void;
}) {
  const theme = useTheme();
  const day = new Date(`${row.date}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${row.description || 'No description'}, ${day}. Give it a line.`}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed || open ? theme.raised : 'transparent' },
        ]}>
        <StationBullet size={12} color={open ? theme.ink : theme.inkFaint} filled={open} />
        <View style={styles.rowBody}>
          <Text variant="body" numberOfLines={1}>
            {row.description || 'No description'}
          </Text>
          <Text variant="caption" tone="faint">
            {day}
          </Text>
        </View>
        <Money cents={row.amount_cents} variant="amount" />
      </Pressable>

      {open ? (
        <View style={styles.rail}>
          <CategoryRail categories={categories} selectedId={null} onSelect={onFile} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
    gap: Space.lg,
  },
  count: {
    paddingHorizontal: Space.xl,
  },
  list: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 56,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rail: {
    paddingBottom: Space.md,
  },
  dock: {
    borderTopWidth: Stroke.route,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  noteText: {
    flex: 1,
  },
  offerBody: {
    flex: 1,
    gap: Space.md,
  },
  offerActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  offerAction: {
    flex: 1,
  },
});
