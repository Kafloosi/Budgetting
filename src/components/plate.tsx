import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { Stroke, type TypeStyle } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/**
 * A selectable plate: the enamel control for picking one of a small set.
 *
 * This was written nine times — as `DirectionPlate`, `SpanPlate`, `KindPlate`,
 * `ScopePlate`, `Plate`, two `Chip`s, `FilterChip`, and inline in Settings — and
 * the first three were identical apart from their names.
 *
 * Geometry stays with the caller. Width, padding and corner radius are what
 * actually differ between a direction plate spanning half the keypad sheet and a
 * filter chip in a scrolling row, so `style` is passed through rather than
 * guessed at here. What this owns is the part that was genuinely duplicated: the
 * press and selection states, the accessibility contract, and the bullet.
 */
export interface PlateProps {
  label: string;
  active: boolean;
  onPress: () => void;
  /**
   * The colour of the selected state. Defaults to ink — a neutral selection.
   * Pass a route colour when the plate belongs to a specific line.
   */
  accent?: string;
  /** A second line beneath the label, for a column name or a sample value. */
  detail?: string;
  /** Replaces the bullet. A `CategoryRoundel`, or a `PlateBullet` of your own. */
  leading?: ReactNode;
  /**
   * `radio` for one-of-a-set, which is nearly always. `button` for a filter that
   * toggles, where announcing a radio group would be a lie.
   */
  role?: 'radio' | 'button';
  variant?: TypeStyle;
  /** Left unset by the plates whose labels are short enough to wrap safely. */
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
}

export function Plate({
  label,
  active,
  onPress,
  accent,
  detail,
  leading,
  role = 'radio',
  variant = 'station',
  numberOfLines,
  style,
}: PlateProps) {
  const theme = useTheme();
  const selected = accent ?? theme.ink;

  const text = (
    <Text variant={variant} tone={active ? 'ink' : 'muted'} numberOfLines={numberOfLines}>
      {label}
    </Text>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        style,
        {
          borderColor: active ? selected : theme.rule,
          backgroundColor: pressed ? theme.raised : 'transparent',
        },
      ]}>
      {leading ?? <PlateBullet color={active ? selected : theme.inkFaint} filled={active} />}
      {detail ? (
        <View>
          {text}
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {detail}
          </Text>
        </View>
      ) : (
        text
      )}
    </Pressable>
  );
}

/**
 * The bullet on its own, for a plate that needs its own colour rule — a line
 * filter keeps its route colour on the border whether it is selected or not, so
 * you can still tell the Violet chip from the Teal one at a glance.
 */
export function PlateBullet({ color, filled }: { color: string; filled: boolean }) {
  return (
    <View
      style={[styles.bullet, { borderColor: color, backgroundColor: filled ? color : 'transparent' }]}
    />
  );
}

const styles = StyleSheet.create({
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
  },
});
