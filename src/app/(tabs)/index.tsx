import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BudgetRoute } from '@/components/budget-route';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { MonthStepper } from '@/components/month-stepper';
import { Screen, SectionLabel } from '@/components/screen';
import { Text } from '@/components/text';
import { TransactionRow } from '@/components/transaction-row';
import { ForecastPanel } from '@/components/transit/forecast-panel';
import { IconArrow, IconInterchange } from '@/components/transit/icons';
import { MonthLine } from '@/components/transit/month-line';
import { CategoryRoundel, Wordmark } from '@/components/transit/roundel';
import { Line, Space, Stroke } from '@/constants/theme';
import { getBudgetProgress } from '@/db/repositories/budgets';
import { goalProgress, listGoals } from '@/db/repositories/goals';
import { getCategorySpend, getMonthTotals, listMonthsWithData, listTransactions } from '@/db/repositories/transactions';
import { shiftMonth, toMonthKey } from '@/db/util';
import { forecastMonth } from '@/lib/forecast';
import { computeInsights } from '@/lib/insights';
import { useTheme } from '@/hooks/use-theme';
import { useLedgerQuery } from '@/providers/ledger';
import { useMoney, useSettings } from '@/providers/settings';

/**
 * The Month — the screen that answers "can I afford this?".
 *
 * Reading order is the diagram's: where the month has got to, then each route
 * against its limit, then what is quietly running without one, then the last
 * few stations called at.
 */
export default function MonthScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const { settings, loading: settingsLoading } = useSettings();
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const previousMonth = shiftMonth(month, -1);

  const totals = useLedgerQuery((db) => getMonthTotals(db, month), [month]);
  const previousTotals = useLedgerQuery((db) => getMonthTotals(db, previousMonth), [previousMonth]);
  const budgets = useLedgerQuery((db) => getBudgetProgress(db, month), [month]);
  const spend = useLedgerQuery((db) => getCategorySpend(db, month), [month]);
  const previousSpend = useLedgerQuery((db) => getCategorySpend(db, previousMonth), [previousMonth]);
  const months = useLedgerQuery((db) => listMonthsWithData(db), []);
  const recent = useLedgerQuery((db) => listTransactions(db, { month, limit: 5 }), [month]);
  const biggest = useLedgerQuery(
    (db) => listTransactions(db, { month, direction: 'out', limit: 200 }),
    [month],
  );
  const goals = useLedgerQuery((db) => listGoals(db), []);

  if (!settingsLoading && !settings.onboarded) return <Redirect href="/welcome" />;

  const budgeted = budgets.data ?? [];
  const budgetedIds = new Set(budgeted.map((entry) => entry.category_id));
  const unbudgeted = (spend.data ?? [])
    .filter((entry) => entry.category_id && !budgetedIds.has(entry.category_id))
    .slice(0, 4);
  const transactions = recent.data ?? [];
  const monthsWithData = [...(months.data ?? [])].reverse();
  const empty = (totals.data?.count ?? 0) === 0 && budgeted.length === 0;
  const isCurrentMonth = month === toMonthKey(new Date());

  const forecast =
    totals.data && isCurrentMonth ? forecastMonth(month, totals.data) : null;

  const biggestOut = (biggest.data ?? []).reduce<{
    description: string;
    amount_cents: number;
  } | null>(
    (worst, entry) =>
      !worst || Math.abs(entry.amount_cents) > Math.abs(worst.amount_cents)
        ? { description: entry.description, amount_cents: entry.amount_cents }
        : worst,
    null,
  );

  const insights =
    totals.data && previousTotals.data
      ? computeInsights({
          month,
          locale: money.locale,
          totals: totals.data,
          previousTotals: previousTotals.data,
          spend: spend.data ?? [],
          previousSpend: previousSpend.data ?? [],
          biggest: biggestOut,
          formatMoney: money.formatAbs,
        })
      : [];

  const openGoals = (goals.data ?? []).filter((goal) => !goalProgress(goal).reached).slice(0, 2);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[]}>
        <View style={styles.masthead}>
          <Wordmark />
          <Pressable
            onPress={() => router.push('/stats')}
            accessibilityRole="button"
            accessibilityLabel="Network stats"
            hitSlop={8}
            style={({ pressed }) => [
              styles.mastheadAction,
              { borderColor: theme.rule, backgroundColor: pressed ? theme.raised : 'transparent' },
            ]}>
            <IconInterchange size={20} color={theme.inkMuted} />
          </Pressable>
        </View>

        <MonthStepper
          month={month}
          months={monthsWithData}
          onChange={setMonth}
          accent={Line.scarlet}
        />

        <MonthLine
          month={month}
          netCents={totals.data?.net_cents ?? 0}
          expenseCents={totals.data?.expense_cents ?? 0}
          incomeCents={totals.data?.income_cents ?? 0}
        />

        {forecast ? <ForecastPanel forecast={forecast} /> : null}

        {empty ? (
          <EmptyState
            accent={Line.scarlet}
            title="No service yet"
            body="Nothing is logged for this month. Add what you just spent and the line starts running."
            action={{ label: 'Log a transaction', onPress: () => router.push('/entry') }}
          />
        ) : null}

        {budgeted.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Routes</SectionLabel>
            {budgeted.map((progress) => (
              <BudgetRoute
                key={progress.category_id}
                progress={progress}
                onPress={() =>
                  router.push({
                    pathname: '/budget',
                    params: { categoryId: progress.category_id, month },
                  })
                }
              />
            ))}
          </View>
        ) : !empty ? (
          <View style={styles.section}>
            <SectionLabel>Routes</SectionLabel>
            <EmptyState
              accent={Line.cobalt}
              title="No limits set"
              body="Put a monthly limit on a category and it appears here as a route with a terminus."
              action={{ label: 'Set a limit', onPress: () => router.push('/budgets') }}
            />
          </View>
        ) : null}

        {unbudgeted.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Running without a limit</SectionLabel>
            {unbudgeted.map((entry) => (
              <Pressable
                key={entry.category_id}
                onPress={() =>
                  router.push({
                    pathname: '/budget',
                    params: { categoryId: entry.category_id!, month },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Set a limit for ${entry.category_name}`}
                style={({ pressed }) => [
                  styles.unbudgeted,
                  { backgroundColor: pressed ? theme.raised : 'transparent' },
                ]}>
                <CategoryRoundel
                  size={28}
                  color={entry.category_color ?? theme.inkFaint}
                  icon={entry.category_icon}
                />
                <Text variant="body" numberOfLines={1} style={styles.unbudgetedName}>
                  {entry.category_name ?? 'Unassigned'}
                </Text>
                <Money
                  cents={-entry.spent_cents}
                  variant="amount"
                  colorIncome={false}
                  signDisplay="never"
                />
                <IconArrow size={18} color={theme.inkMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {insights.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Service notices</SectionLabel>
            {insights.map((insight) => (
              <View key={insight.id} style={styles.insight}>
                <View
                  style={[
                    styles.insightBullet,
                    { borderColor: insight.color ?? theme.inkFaint },
                  ]}
                />
                <Text variant="body" tone="muted" style={styles.insightText}>
                  {insight.text}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {openGoals.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <SectionLabel>Under construction</SectionLabel>
              <Pressable
                onPress={() => router.push('/goals')}
                accessibilityRole="button"
                accessibilityLabel="Open savings goals"
                hitSlop={8}
                style={styles.seeAll}>
                <Text variant="station" color={theme.onGround.cobalt}>
                  All
                </Text>
                <IconArrow size={16} color={theme.onGround.cobalt} />
              </Pressable>
            </View>
            {openGoals.map((goal) => {
              const progress = goalProgress(goal);
              return (
                <Pressable
                  key={goal.id}
                  onPress={() => router.push({ pathname: '/goal', params: { id: goal.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${goal.name}: ${money.formatAbs(
                    goal.saved_cents,
                  )} of ${money.formatAbs(goal.target_cents)} saved`}
                  style={({ pressed }) => [
                    styles.unbudgeted,
                    { backgroundColor: pressed ? theme.raised : 'transparent' },
                  ]}>
                  <View style={[styles.goalStripe, { backgroundColor: goal.color }]} />
                  <Text variant="body" numberOfLines={1} style={styles.unbudgetedName}>
                    {goal.name}
                  </Text>
                  <Text variant="amountSmall" tone="muted">
                    {`${Math.round(progress.ratio * 100)}%`}
                  </Text>
                  <Money cents={goal.saved_cents} variant="amount" colorIncome={false} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {transactions.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <SectionLabel>Last called at</SectionLabel>
              <Pressable
                onPress={() => router.push('/ledger')}
                accessibilityRole="button"
                accessibilityLabel="Open the full ledger"
                hitSlop={8}
                style={styles.seeAll}>
                <Text variant="station" color={theme.onGround.cobalt}>
                  All
                </Text>
                <IconArrow size={16} color={theme.onGround.cobalt} />
              </Pressable>
            </View>
            {transactions.map((transaction, index) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                first={index === 0}
                last={index === transactions.length - 1}
                onPress={() => router.push({ pathname: '/entry', params: { id: transaction.id } })}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.md,
    paddingBottom: 140,
    gap: Space.xl,
  },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.xl,
  },
  mastheadAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xs,
  },
  insightBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
    marginTop: 7,
  },
  insightText: {
    flex: 1,
  },
  goalStripe: {
    width: Stroke.route,
    height: 28,
    borderRadius: Stroke.route / 2,
  },
  section: {
    gap: Space.xs,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Space.xl,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.md,
  },
  unbudgeted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 56,
  },
  unbudgetedName: {
    flex: 1,
  },
  seeAllSpacer: {
    width: Stroke.hairline,
  },
});
