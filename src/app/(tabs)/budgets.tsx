import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BudgetRoute } from '@/components/budget-route';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { MonthStepper } from '@/components/month-stepper';
import { Screen, ScreenHeader, SectionLabel } from '@/components/screen';
import { Text } from '@/components/text';
import { IconArrow } from '@/components/transit/icons';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Space, Stroke } from '@/constants/theme';
import { getBudgetProgress, getRecurringLimits } from '@/db/repositories/budgets';
import { listCategories } from '@/db/repositories/categories';
import { getCategorySpend, listMonthsWithData } from '@/db/repositories/transactions';
import { toMonthKey } from '@/db/util';
import { useTheme } from '@/hooks/use-theme';
import { useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

/**
 * Budgets — the network's timetable.
 *
 * Routes with a limit come first, each against this month's spending. Below
 * them sit the categories still running unlimited, so extending the network is
 * one tap from seeing the gap.
 */
export default function BudgetsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const [month, setMonth] = useState(() => toMonthKey(new Date()));

  const progress = useLedgerQuery((db) => getBudgetProgress(db, month), [month]);
  const recurring = useLedgerQuery((db) => getRecurringLimits(db), []);
  const categories = useLedgerQuery((db) => listCategories(db, { kind: 'expense' }), []);
  const spend = useLedgerQuery((db) => getCategorySpend(db, month), [month]);
  const months = useLedgerQuery((db) => listMonthsWithData(db), []);

  const budgeted = progress.data ?? [];
  const budgetedIds = new Set(budgeted.map((entry) => entry.category_id));
  const unlimited = (categories.data ?? []).filter((category) => !budgetedIds.has(category.id));
  const spendByCategory = new Map(
    (spend.data ?? []).map((entry) => [entry.category_id, entry.spent_cents]),
  );

  const totalLimit = budgeted.reduce((sum, entry) => sum + entry.limit_cents, 0);
  const totalSpent = budgeted.reduce((sum, entry) => sum + entry.spent_cents, 0);

  return (
    <Screen>
      <ScreenHeader
        title="Budgets"
        subtitle={
          budgeted.length > 0
            ? `${money.formatAbs(totalSpent)} of ${money.formatAbs(totalLimit)} across ${budgeted.length} ${budgeted.length === 1 ? 'route' : 'routes'}`
            : 'No limits set yet'
        }
        accent={Line.amber}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MonthStepper
          month={month}
          months={[...(months.data ?? [])].reverse()}
          onChange={setMonth}
          accent={Line.amber}
        />

        {budgeted.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>In service</SectionLabel>
            {budgeted.map((entry) => (
              <BudgetRoute
                key={entry.category_id}
                progress={entry}
                onPress={() =>
                  router.push({
                    pathname: '/budget',
                    params: { categoryId: entry.category_id, month },
                  })
                }
              />
            ))}
          </View>
        ) : (
          <EmptyState
            accent={Line.amber}
            title="No limits set"
            body="A limit turns a category into a route with an end of line, so you can see how much of it is left without doing the sums."
          />
        )}

        {unlimited.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Unlimited</SectionLabel>
            {unlimited.map((category) => {
              const spent = spendByCategory.get(category.id) ?? 0;
              return (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    router.push({ pathname: '/budget', params: { categoryId: category.id, month } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Set a limit for ${category.name}. ${
                    spent > 0 ? `${money.formatAbs(spent)} spent this month.` : 'Nothing spent this month.'
                  }`}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.raised : 'transparent' },
                  ]}>
                  <CategoryRoundel size={30} color={category.color} icon={category.icon} />
                  <View style={styles.rowBody}>
                    <Text variant="body" numberOfLines={1}>
                      {category.name}
                    </Text>
                    {recurring.data?.[category.id] ? (
                      <Text variant="caption" tone="muted">
                        {`Recurring ${money.formatAbs(recurring.data[category.id])} — not in service this month`}
                      </Text>
                    ) : null}
                  </View>
                  {spent > 0 ? (
                    <Money cents={-spent} variant="amountSmall" tone="muted" colorIncome={false} />
                  ) : null}
                  <IconArrow size={18} color={theme.inkMuted} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push('/categories')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.footerLink,
            { borderTopColor: theme.rule, backgroundColor: pressed ? theme.raised : 'transparent' },
          ]}>
          <Text variant="station" color={theme.onGround.cobalt}>
            Manage categories
          </Text>
          <IconArrow size={18} color={theme.onGround.cobalt} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.lg,
    paddingBottom: 140,
    gap: Space.xl,
  },
  section: {
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
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    marginTop: Space.lg,
    paddingVertical: Space.xl,
    borderTopWidth: Stroke.hairline,
  },
});
