import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/text';
import { FontFamily, Radius, Space, Stroke, TouchTarget, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A field is a section of track with a bullet at each end — the same plate the
 * buttons use, so a form reads as one continuous line rather than a stack of
 * unrelated boxes. Focus lights the far bullet and the border, the way an
 * active section lights on a diagram.
 */
export function Field({
  label,
  hint,
  error,
  leading,
  children,
  focused = false,
  style,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  children: ReactNode;
  focused?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const borderColor = error ? theme.onGround.scarlet : focused ? theme.focus : theme.rule;
  const bulletColor = error ? theme.onGround.scarlet : focused ? theme.focus : theme.inkFaint;

  const plate = (
    <View style={[styles.plate, { borderColor }]}>
      {leading}
      <View style={styles.control}>{children}</View>
      <View style={[styles.bullet, { borderColor: bulletColor, backgroundColor: focused ? bulletColor : 'transparent' }]} />
    </View>
  );

  return (
    <View style={[styles.field, style]}>
      <Text variant="station" tone="muted" style={styles.label}>
        {label}
      </Text>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}>
          {plate}
        </Pressable>
      ) : (
        plate
      )}
      {error ? (
        <Text variant="caption" color={theme.onGround.scarlet} style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A field wrapping a text input. */
export function TextField({
  label,
  hint,
  error,
  leading,
  style,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
} & TextInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} leading={leading} focused={focused} style={style}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.inkMuted}
        selectionColor={theme.focus}
        {...inputProps}
        onFocus={(event) => {
          setFocused(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          inputProps.onBlur?.(event);
        }}
        style={[styles.input, { color: theme.ink }]}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Space.sm,
  },
  label: {
    paddingLeft: Space.xs,
  },
  plate: {
    minHeight: TouchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  control: {
    flex: 1,
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
  },
  input: {
    fontFamily: FontFamily.sans,
    fontSize: Type.body.fontSize,
    paddingVertical: Space.md,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  selectValue: {
    flex: 1,
  },
  helper: {
    paddingLeft: Space.lg,
  },
});
