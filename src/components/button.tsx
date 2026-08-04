import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconArrow } from '@/components/transit/icons';
import { Text } from '@/components/text';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Hides the trailing arrow for actions that do not move you anywhere. */
  showArrow?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/**
 * A button is a short length of route: an origin bullet, the destination named
 * on the line, and an arrow where it is taking you. Filled for the primary
 * action, drawn in outline for everything else.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  showArrow = true,
  style,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();

  const fill =
    variant === 'primary' ? Line.scarlet : variant === 'danger' ? theme.ground : 'transparent';
  const border =
    variant === 'primary'
      ? Line.scarlet
      : variant === 'danger'
        ? theme.onGround.scarlet
        : variant === 'quiet'
          ? theme.rule
          : theme.ink;
  const content =
    variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? theme.onGround.scarlet : theme.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: fill,
          borderColor: border,
          opacity: disabled ? 0.4 : pressed ? 0.82 : 1,
        },
        style,
      ]}>
      <View style={[styles.bullet, { borderColor: content }]} />
      <Text variant="station" color={content} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      {showArrow ? <IconArrow size={18} color={content} /> : <View style={styles.spacer} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TouchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  bullet: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: Stroke.tick,
  },
  label: {
    flex: 1,
  },
  spacer: {
    width: 12,
  },
});
