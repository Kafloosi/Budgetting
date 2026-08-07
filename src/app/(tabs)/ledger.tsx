import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Money } from '@/components/money';
import { Plate, PlateBullet } from '@/components/plate';
import { Screen, ScreenHeader } from '@/components/screen';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { Text } from '@/components/text';
import { TransactionRow } from '@/components/transaction-row';
import { IconSearch } from '@/components/transit/icons';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { listCategories } from '@/db/repositories/categories';
import {
  deleteSavedFilter,
  listSavedFilters,
  saveFilter,
  type SavedFilter,
} from '@/db/repositories/saved-filters';
import {
  deleteTransaction,
  listTransactions,
  type TransactionWithCategory,
} from '@/db/repositories/transactions';
import { toMonthKey } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';
import { useUndo } from '@/providers/undo';
import { restoreTransaction } from '@/db/repositories/trash';

type Direction = 'all' | 'out' | 'in';
type Scope = 'month' | 'all';

/**
 * The ledger — every transaction as a running route, newest station first.
 *
 * Days are the section headings because that is how people remember spending:
 * not "the 200 euros in August" but "that Saturday".
 */
export default function LedgerScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const undo = useUndo();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>('all');
  const [scope, setScope] = useState<Scope>('month');
  const [searchFocused, setSearchFocused] = useState(false);
  const [naming, setNaming] = useState(false);
  const [filterName, setFilterName] = useState('');

  const month = toMonthKey(new Date());
  const categories = useLedgerQuery((database) => listCategories(database), []);
  const saved = useLedgerQuery((database) => listSavedFilters(database), []);

  /** Anything other than the default view is worth being able to keep. */
  const filtered =
    search.trim().length > 0 || categoryId !== null || direction !== 'all' || scope !== 'month';

  function applySaved(filter: SavedFilter) {
    setSearch(filter.search ?? '');
    setCategoryId(filter.category_id);
    setDirection(filter.direction);
    setScope(filter.scope);
  }

  async function keepFilter() {
    const name = filterName.trim();
    if (!name) return;
    await saveFilter(db, {
      name,
      search: search.trim() || null,
      direction,
      category_id: categoryId,
      scope,
    });
    setNaming(false);
    setFilterName('');
    invalidate();
  }

  function forgetFilter(filter: SavedFilter) {
    Alert.alert(`Forget "${filter.name}"?`, 'The transactions are untouched.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          await deleteSavedFilter(db, filter.id);
          invalidate();
        },
      },
    ]);
  }
  const transactions = useLedgerQuery(
    (database) =>
      listTransactions(database, {
        search: search.trim() || undefined,
        categoryId: categoryId ?? undefined,
        direction: direction === 'all' ? undefined : direction,
        month: scope === 'month' ? month : undefined,
        limit: 500,
      }),
    [search, categoryId, direction, scope, month],
  );

  const sections = useMemo(() => groupByDay(transactions.data ?? [], money.locale), [
    transactions.data,
    money.locale,
  ]);

  /**
   * Delete without a confirmation dialog, and offer it back for five seconds.
   * The row is soft-deleted either way, so even a missed undo is recoverable
   * from the trash for thirty days.
   */
  async function remove(transaction: TransactionWithCategory) {
    await deleteTransaction(db, transaction.id);
    haptics.removed();
    invalidate();
    undo.offer(
      `Deleted ${transaction.description || 'entry'} — ${money.format(transaction.amount_cents)}`,
      async () => {
        await restoreTransaction(db, transaction.id);
        invalidate();
      },
    );
  }

  const filtering = Boolean(search.trim() || categoryId || direction !== 'all' || scope === 'month');

  return (
    <Screen>
      <ScreenHeader
        title="Ledger"
        subtitle={
          transactions.data
            ? `${transactions.data.length} ${transactions.data.length === 1 ? 'entry' : 'entries'}`
            : undefined
        }
        accent={Line.cobalt}
      />

      <View style={styles.controls}>
        <Field
          label="Find"
          focused={searchFocused}
          leading={<IconSearch size={20} color={theme.inkMuted} />}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Description or note"
            placeholderTextColor={theme.inkMuted}
            selectionColor={theme.focus}
            accessibilityLabel="Search transactions"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[styles.searchInput, { color: theme.ink }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </Field>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}>
          <FilterChip
            label={scope === 'month' ? 'This month' : 'All time'}
            active={scope === 'all'}
            color={theme.ink}
            onPress={() => setScope(scope === 'month' ? 'all' : 'month')}
          />
          <FilterChip
            label={direction === 'all' ? 'In and out' : direction === 'out' ? 'Out only' : 'In only'}
            active={direction !== 'all'}
            color={direction === 'in' ? Line.green : Line.scarlet}
            onPress={() =>
              setDirection(direction === 'all' ? 'out' : direction === 'out' ? 'in' : 'all')
            }
          />
          <View style={[styles.filterDivider, { backgroundColor: theme.rule }]} />
          <FilterChip
            label="All lines"
            active={categoryId === null}
            color={theme.ink}
            onPress={() => setCategoryId(null)}
          />
          {(categories.data ?? []).map((category) => (
            <FilterChip
              key={category.id}
              label={category.name}
              active={categoryId === category.id}
              color={category.color}
              icon={category.icon}
              onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
            />
          ))}
        </ScrollView>

        {(saved.data ?? []).length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}>
            {(saved.data ?? []).map((filter) => (
              <FilterChip
                key={filter.id}
                label={filter.name}
                active={false}
                color={theme.onGround.cobalt}
                onPress={() => applySaved(filter)}
                onLongPress={() => forgetFilter(filter)}
              />
            ))}
          </ScrollView>
        ) : null}

        {naming ? (
          <View style={styles.naming}>
            <Field label="Call this filter" focused>
              <TextInput
                value={filterName}
                onChangeText={setFilterName}
                placeholder="Dining out this month"
                placeholderTextColor={theme.inkMuted}
                selectionColor={theme.focus}
                accessibilityLabel="Name for this filter"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={keepFilter}
                style={[styles.searchInput, { color: theme.ink }]}
              />
            </Field>
            <View style={styles.namingActions}>
              <Button
                label="Cancel"
                variant="quiet"
                showArrow={false}
                onPress={() => setNaming(false)}
                style={styles.namingAction}
              />
              <Button
                label="Keep it"
                onPress={keepFilter}
                disabled={filterName.trim().length === 0}
                style={styles.namingAction}
              />
            </View>
          </View>
        ) : filtered ? (
          <Button
            label="Keep this filter"
            variant="quiet"
            showArrow={false}
            onPress={() => setNaming(true)}
          />
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text variant="station" tone="muted">
              {section.title}
            </Text>
            <View style={[styles.dayRule, { backgroundColor: theme.rule }]} />
            <Money cents={section.total} variant="amountSmall" tone="muted" colorIncome={false} />
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <SwipeToDelete
            onDelete={() => remove(item)}
            accessibilityLabel={`Delete ${item.description || 'transaction'}`}>
            {/*
              No background here: the delete panel is revealed beside the row,
              not beneath it, and painting the row opaque would cover the
              enamel surface with a visible seam.
            */}
            <TransactionRow
              transaction={item}
              first={index === 0}
              last={index === section.data.length - 1}
              onPress={() => router.push({ pathname: '/entry', params: { id: item.id } })}
            />
          </SwipeToDelete>
        )}
        ListEmptyComponent={
          transactions.loading ? null : (
            <EmptyState
              accent={Line.cobalt}
              title={filtering ? 'Nothing on this line' : 'The ledger is empty'}
              body={
                filtering
                  ? 'No transaction matches that search on this line. Clear the filter to see everything.'
                  : 'Every transaction you log shows up here, newest first.'
              }
              action={
                filtering
                  ? {
                      label: 'Clear filters',
                      onPress: () => {
                        setSearch('');
                        setCategoryId(null);
                        setDirection('all');
                        setScope('all');
                      },
                    }
                  : { label: 'Log a transaction', onPress: () => router.push('/entry') }
              }
            />
          )
        }
      />
    </Screen>
  );
}

/**
 * A line filter. `button` rather than `radio` because these toggle — tapping the
 * active one clears it — and the bullet keeps its route colour even when the
 * filter is off, so the Violet chip stays tellable from the Teal one.
 */
function FilterChip({
  label,
  active,
  color,
  icon,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  color: string;
  icon?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Plate
      style={styles.chip}
      role="button"
      variant="label"
      numberOfLines={1}
      accent={color}
      label={label}
      active={active}
      onPress={onPress}
      onLongPress={onLongPress}
      leading={
        icon ? (
          <CategoryRoundel size={22} color={color} icon={icon} name={label} />
        ) : (
          <PlateBullet color={color} filled={active} />
        )
      }
    />
  );
}

interface DaySection {
  title: string;
  total: number;
  data: TransactionWithCategory[];
}

function groupByDay(transactions: TransactionWithCategory[], locale: string): DaySection[] {
  const sections: DaySection[] = [];
  for (const transaction of transactions) {
    const last = sections[sections.length - 1];
    if (last && last.data[0]?.date === transaction.date) {
      last.data.push(transaction);
      last.total += transaction.amount_cents;
      continue;
    }
    sections.push({
      title: new Date(`${transaction.date}T00:00:00`).toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      total: transaction.amount_cents,
      data: [transaction],
    });
  }
  return sections;
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    gap: Space.md,
  },
  searchInput: {
    fontSize: 17,
    paddingVertical: Space.md,
  },
  filters: {
    gap: Space.sm,
    paddingRight: Space.xl,
    alignItems: 'center',
  },
  naming: {
    gap: Space.sm,
  },
  namingActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  namingAction: {
    flex: 1,
  },
  filterDivider: {
    width: Stroke.hairline,
    height: 24,
    marginHorizontal: Space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TouchTarget - 8,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  list: {
    paddingTop: Space.lg,
    paddingBottom: 140,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    paddingBottom: Space.sm,
  },
  dayRule: {
    flex: 1,
    height: Stroke.hairline,
  },
});
