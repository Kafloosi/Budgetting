import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { RouteLine } from '@/components/transit/route';
import { Line, Space } from '@/constants/theme';
import type { Forecast } from '@/lib/forecast';
import { useTheme } from '@/hooks/use-theme';
import { useMoney } from '@/providers/settings';

/**
 * Where the month is scheduled to terminate.
 *
 * The month line above it says where you are; this says where you will end up
 * if nothing changes. Drawn against income as the terminus, so the question it
 * answers is the one people actually ask — will this fit?
 *
 * Hidden entirely in the first days of a month: extrapolating from two days of
 * spending produces a confident number that is simply wrong.
 */
export function ForecastPanel({ forecast }: { forecast: Forecast }) {
  const theme = useTheme();
  const money = useMoney();

  if (!forecast.reliable) return null;

  const over = forecast.projectedOverspendCents > 0;
  const ratio = forecast.incomeCents > 0 ? forecast.projectedCents / forecast.incomeCents : 0;
  const status = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'under';
  const remainingDays = forecast.totalDays - forecast.elapsedDays;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="station" tone="muted">
          Projected arrival
        </Text>
        <Text variant="amount" color={over ? theme.onGround.scarlet : theme.ink}>
          {money.formatAbs(forecast.projectedCents)}
        </Text>
      </View>

      <RouteLine color={over ? Line.scarlet : Line.amber} ratio={ratio} status={status} />

      <Text variant="caption" tone="muted">
        {`At ${money.formatAbs(forecast.dailyPaceCents)} a day, this month finishes ${
          over
            ? `${money.formatAbs(forecast.projectedOverspendCents)} past your income`
            : `${money.formatAbs(-forecast.projectedOverspendCents)} inside your income`
        }.`}
      </Text>

      {remainingDays > 0 ? (
        <Text variant="caption" color={over ? theme.onGround.amber : theme.inkMuted}>
          {forecast.safeDailyCents > 0
            ? `${money.formatAbs(forecast.safeDailyCents)} a day is safe for the ${remainingDays} ${
                remainingDays === 1 ? 'day' : 'days'
              } left.`
            : `This month's income is already spent, with ${remainingDays} ${
                remainingDays === 1 ? 'day' : 'days'
              } left.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.md,
  },
});
