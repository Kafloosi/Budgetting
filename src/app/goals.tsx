import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { RouteLine } from '@/components/transit/route';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { contributeToGoal, goalProgress, listGoals } from '@/db/repositories/goals';
import type { Goal } from '@/db/types';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

/** Contribution steps, in whole units of the chosen currency. */
const STEPS = [10, 25, 100];

/**
 * Savings goals — routes still under construction.
 *
 * Money set aside here is not a ledger transaction: putting money in a goal
 * does not make it leave your account, and counting it as spending would charge
 * it against the month's budgets twice.
 */
export default function GoalsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const goals = useLedgerQuery((database) => listGoals(database), []);

  const all = goals.data ?? [];

  async function contribute(goal: Goal, units: number) {
    await contributeToGoal(db, goal.id, units * 100);
    haptics.saved();
    invalidate();
  }

  return (
    <Screen>
      <SheetHeader
        title="Savings goals"
        accent={Line.teal}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {all.length === 0 ? (
          <EmptyState
            accent={Line.teal}
            title="No goals yet"
            body="A goal is a line you are still building: a target, an optional date, and whatever you have put aside so far."
            action={{ label: 'Open a goal', onPress: () => router.push('/goal') }}
          />
        ) : (
          all.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onContribute={contribute} router={router} />
          ))
        )}

        {all.length > 0 ? (
          <View style={styles.footer}>
            <Button label="New goal" onPress={() => router.push('/goal')} variant="secondary" />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function GoalCard({
  goal,
  onContribute,
  router,
}: {
  goal: Goal;
  onContribute: (goal: Goal, units: number) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const theme = useTheme();
  const money = useMoney();
  const progress = goalProgress(goal);

  const status = progress.reached
    ? 'Reached'
    : progress.monthly_suggestion_cents
      ? `${money.formatAbs(progress.monthly_suggestion_cents)} a month to arrive on time`
      : `${money.formatAbs(progress.remaining_cents)} to go`;

  return (
    <View style={styles.goal}>
      <Pressable
        onPress={() => router.push({ pathname: '/goal', params: { id: goal.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${goal.name}. ${money.formatAbs(goal.saved_cents)} of ${money.formatAbs(
          goal.target_cents,
        )} saved. ${status}.`}
        style={({ pressed }) => [
          styles.goalHead,
          { backgroundColor: pressed ? theme.raised : 'transparent' },
        ]}>
        <View style={[styles.goalStripe, { backgroundColor: goal.color }]} />
        <View style={styles.goalBody}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {goal.name}
          </Text>
          <Text
            variant="caption"
            color={progress.reached ? theme.onGround.green : theme.inkMuted}>
            {status}
          </Text>
        </View>
        <View style={styles.goalAmounts}>
          <Money cents={goal.saved_cents} variant="amount" colorIncome={false} />
          <Text variant="amountSmall" tone="faint">
            {` / ${money.formatAbs(goal.target_cents)}`}
          </Text>
        </View>
      </Pressable>

      <View style={styles.goalTrack}>
        <RouteLine
          color={goal.color}
          ratio={progress.ratio}
          status={progress.reached ? 'under' : 'under'}
        />
      </View>

      <View style={styles.steps}>
        {STEPS.map((units) => (
          <Pressable
            key={units}
            onPress={() => onContribute(goal, units)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${money.formatAbs(units * 100)} to ${goal.name}`}
            style={({ pressed }) => [
              styles.step,
              { borderColor: theme.rule, backgroundColor: pressed ? theme.raised : 'transparent' },
            ]}>
            <Text variant="station">{`+ ${money.formatAbs(units * 100)}`}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => onContribute(goal, -STEPS[0])}
          accessibilityRole="button"
          accessibilityLabel={`Take ${money.formatAbs(STEPS[0] * 100)} back out of ${goal.name}`}
          style={({ pressed }) => [
            styles.step,
            { borderColor: theme.rule, backgroundColor: pressed ? theme.raised : 'transparent' },
          ]}>
          <Text variant="station" tone="muted">{`− ${money.formatAbs(STEPS[0] * 100)}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.xl,
    gap: Space.xl,
  },
  goal: {
    gap: Space.md,
  },
  goalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingRight: Space.xl,
    paddingVertical: Space.md,
  },
  goalStripe: {
    width: Stroke.route,
    height: 40,
    borderRadius: Stroke.route / 2,
    marginLeft: Space.xl - Stroke.route,
  },
  goalBody: {
    flex: 1,
    gap: 2,
  },
  goalAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  goalTrack: {
    paddingHorizontal: Space.xl,
  },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  step: {
    minHeight: TouchTarget - 6,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  footer: {
    paddingHorizontal: Space.xl,
  },
});
