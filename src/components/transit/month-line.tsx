import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Money } from '@/components/money';
import { Text } from '@/components/text';
import { Line, Motion, Space, Stroke } from '@/constants/theme';
import type { MonthKey } from '@/db/types';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';

/**
 * The month itself, drawn as a line from the first to the last day.
 *
 * The marker is today. The month's net is printed at the marker rather than
 * enthroned at the top of the screen, so the number always arrives with the
 * question that makes it mean something: how far through the month is this?
 * Two thirds of the way along with a third of the money left is a different
 * story from the same number on the 2nd.
 */
export function MonthLine({
  month,
  netCents,
  expenseCents,
  incomeCents,
}: {
  month: MonthKey;
  netCents: number;
  expenseCents: number;
  incomeCents: number;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [track, setTrack] = useState(0);

  const { fraction, dayLabel, days } = monthPosition(month);
  const marker = track * fraction;

  const progress = useSharedValue(0);
  useEffect(() => {
    if (!track) return;
    if (reduceMotion) {
      progress.value = marker;
      return;
    }
    progress.value = withTiming(marker, {
      duration: Motion.arrival,
      easing: Easing.bezier(...Motion.ease),
    });
  }, [marker, track, reduceMotion, progress]);

  const travelled = useAnimatedStyle(() => ({ width: progress.value }));
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value - 9 }] }));
  // The label follows the marker but never runs off either end.
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, Math.min(progress.value - 60, track - 140)) }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.scale}>
        <Text variant="station" tone="faint">
          1
        </Text>
        <Text variant="station" tone="muted">
          {dayLabel}
        </Text>
        <Text variant="station" tone="faint">
          {String(days)}
        </Text>
      </View>

      <View
        style={styles.track}
        onLayout={(event: LayoutChangeEvent) => setTrack(event.nativeEvent.layout.width)}>
        <View style={[styles.bed, { backgroundColor: theme.rule }]} />
        <Animated.View style={[styles.travelled, travelled, { backgroundColor: Line.scarlet }]} />
        <View style={[styles.origin, { borderColor: Line.scarlet, backgroundColor: theme.ground }]} />
        <View style={[styles.terminus, { backgroundColor: theme.ink }]} />
        {track > 0 ? (
          <Animated.View
            style={[
              styles.marker,
              markerStyle,
              { borderColor: Line.scarlet, backgroundColor: theme.ground },
            ]}
          />
        ) : null}
      </View>

      <Animated.View style={[styles.readout, labelStyle]}>
        <Text variant="station" tone="muted">
          Net so far
        </Text>
        <Money cents={netCents} variant="display" colorIncome={false} signDisplay="always" />
      </Animated.View>

      <View style={[styles.totals, { borderTopColor: theme.rule }]}>
        <Total label="Out" cents={-expenseCents} />
        <View style={[styles.totalsDivider, { backgroundColor: theme.rule }]} />
        <Total label="In" cents={incomeCents} />
      </View>
    </View>
  );
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <View style={styles.total}>
      <Text variant="station" tone="muted">
        {label}
      </Text>
      <Money cents={cents} variant="amount" colorIncome={cents > 0} />
    </View>
  );
}

/** Where today sits inside `month`, and how the day should be written. */
function monthPosition(month: MonthKey): { fraction: number; dayLabel: string; days: number } {
  const [year, monthIndex] = month.split('-').map(Number);
  const days = new Date(year, monthIndex, 0).getDate();
  const today = new Date();
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === monthIndex;

  if (isCurrent) {
    return { fraction: today.getDate() / days, dayLabel: `Day ${today.getDate()}`, days };
  }
  const isPast = new Date(year, monthIndex, 0) < today;
  return { fraction: isPast ? 1 : 0, dayLabel: isPast ? 'Closed' : 'Not started', days };
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  track: {
    height: 20,
    justifyContent: 'center',
  },
  bed: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: Stroke.route,
    borderRadius: Stroke.route / 2,
  },
  travelled: {
    position: 'absolute',
    left: 0,
    height: Stroke.route,
    borderRadius: Stroke.route / 2,
  },
  origin: {
    position: 'absolute',
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: Stroke.tick,
  },
  terminus: {
    position: 'absolute',
    right: 0,
    width: Stroke.tick * 2,
    height: 20,
    borderRadius: 1,
  },
  marker: {
    position: 'absolute',
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  readout: {
    marginTop: Space.sm,
    alignItems: 'flex-start',
    gap: Space.xs,
  },
  totals: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.md,
    marginTop: Space.sm,
  },
  total: {
    flex: 1,
    gap: 2,
  },
  totalsDivider: {
    width: Stroke.hairline,
    alignSelf: 'stretch',
    marginHorizontal: Space.lg,
  },
});
