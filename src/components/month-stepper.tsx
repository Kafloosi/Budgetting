import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { IconArrow, IconBack } from '@/components/transit/icons';
import { Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import type { MonthKey } from '@/db/types';
import { formatMonthLabel, shiftMonth, toMonthKey } from '@/db/util';
import { useTheme } from '@/hooks/use-theme';
import { useMoney } from '@/providers/settings';

/**
 * The month, moved one stop at a time.
 *
 * Below the name runs a strip of ticks — one per month the ledger holds — so
 * the extent of your own history is visible without opening anything. The month
 * on screen is the filled bullet.
 */
export function MonthStepper({
  month,
  months,
  onChange,
  accent,
}: {
  month: MonthKey;
  /** Every month with at least one transaction, oldest first. */
  months: MonthKey[];
  onChange: (month: MonthKey) => void;
  accent: string;
}) {
  const theme = useTheme();
  const money = useMoney();
  const label = formatMonthLabel(month, money.locale);

  // No time travel. A future month has no spending to look at and no budget
  // state to be in, so stepping into one only ever produces an empty screen
  // the user then has to find their way back out of.
  const atLatest = month >= toMonthKey(new Date());

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Stepper
          direction="back"
          label="Previous month"
          onPress={() => onChange(shiftMonth(month, -1))}
        />
        <Text variant="station" style={styles.label} numberOfLines={1} accessibilityRole="header">
          {label}
        </Text>
        <Stepper
          direction="forward"
          label="Next month"
          disabled={atLatest}
          onPress={() => onChange(shiftMonth(month, 1))}
        />
      </View>

      {months.length > 1 ? (
        <View style={styles.ticks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.tickRule, { backgroundColor: theme.rule }]} />
          {months.map((candidate) => (
            <Pressable
              key={candidate}
              onPress={() => onChange(candidate)}
              hitSlop={12}
              style={styles.tickHit}>
              <View
                style={[
                  styles.tick,
                  candidate === month
                    ? { backgroundColor: accent, borderColor: accent, width: 10, height: 10 }
                    : { backgroundColor: theme.ground, borderColor: theme.inkFaint },
                ]}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stepper({
  direction,
  label,
  onPress,
  disabled = false,
}: {
  direction: 'back' | 'forward';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const Icon = direction === 'back' ? IconBack : IconArrow;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.stepper,
        {
          borderColor: theme.rule,
          backgroundColor: pressed ? theme.raised : 'transparent',
          opacity: disabled ? 0.35 : 1,
        },
      ]}>
      <Icon size={20} color={theme.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
  },
  label: {
    flex: 1,
    textAlign: 'center',
  },
  stepper: {
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.xl,
    height: 16,
  },
  tickRule: {
    position: 'absolute',
    left: Space.xl,
    right: Space.xl,
    height: Stroke.hairline,
  },
  tickHit: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 16,
  },
  tick: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    borderWidth: Stroke.hairline,
  },
});
