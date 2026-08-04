import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Line, Space, Stroke } from '@/constants/theme';
import type { MonthBar } from '@/db/repositories/stats';
import { useTheme } from '@/hooks/use-theme';
import { useMoney } from '@/providers/settings';

const BAR_HEIGHT = 72;

/**
 * Months read against one datum line: income rising above it, spending
 * dropping below. The line is the same route rule the rest of the app uses, so
 * a run of months reads as a stretch of track rather than as a chart pasted in
 * from somewhere else.
 *
 * Bars share one scale — the largest amount in the window — because bars that
 * each rescale themselves make a quiet month look like a busy one.
 */
export function MonthBars({
  bars,
  selected,
  onSelect,
}: {
  bars: MonthBar[];
  selected?: string;
  onSelect?: (month: string) => void;
}) {
  const theme = useTheme();
  const money = useMoney();

  const peak = Math.max(
    1,
    ...bars.map((bar) => Math.max(bar.income_cents, bar.expense_cents)),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {bars.map((bar) => {
          const active = bar.month === selected;
          const label = monthInitial(bar.month, money.locale);
          return (
            <Pressable
              key={bar.month}
              onPress={onSelect ? () => onSelect(bar.month) : undefined}
              accessibilityRole={onSelect ? 'button' : undefined}
              accessibilityLabel={`${label}: ${money.formatAbs(bar.income_cents)} in, ${money.formatAbs(
                bar.expense_cents,
              )} out`}
              style={styles.column}>
              <View style={styles.half}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.round((bar.income_cents / peak) * BAR_HEIGHT),
                      backgroundColor: Line.green,
                      opacity: active || !selected ? 1 : 0.45,
                    },
                  ]}
                />
              </View>

              <View style={[styles.datum, { backgroundColor: active ? theme.ink : theme.rule }]} />

              <View style={styles.halfDown}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.round((bar.expense_cents / peak) * BAR_HEIGHT),
                      backgroundColor: Line.scarlet,
                      opacity: active || !selected ? 1 : 0.45,
                    },
                  ]}
                />
              </View>

              <Text
                variant="station"
                tone={active ? 'ink' : 'muted'}
                style={styles.label}
                numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Key color={Line.green} label="In" />
        <Key color={Line.scarlet} label="Out" />
      </View>
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.keyLine, { backgroundColor: color }]} />
      <Text variant="station" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** e.g. `Aug`. Falls back to the month number if the locale gives a long name. */
function monthInitial(month: string, locale: string): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

const styles = StyleSheet.create({
  wrap: {
    gap: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.xs,
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  half: {
    height: BAR_HEIGHT,
    justifyContent: 'flex-end',
  },
  halfDown: {
    height: BAR_HEIGHT,
    justifyContent: 'flex-start',
  },
  bar: {
    width: 18,
    borderRadius: 2,
  },
  datum: {
    height: Stroke.tick,
    alignSelf: 'stretch',
  },
  label: {
    marginTop: Space.sm,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  legend: {
    flexDirection: 'row',
    gap: Space.lg,
    justifyContent: 'center',
  },
  key: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  keyLine: {
    width: 16,
    height: Stroke.route,
    borderRadius: Stroke.route / 2,
  },
});
