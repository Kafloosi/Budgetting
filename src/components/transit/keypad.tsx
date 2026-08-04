import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { IconBackspace } from '@/components/transit/icons';
import { FontFamily, Radius, Space, Stroke } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The amount keypad.
 *
 * Digits fill from the right in cents — 1, 2, 5 is €1.25 — so an amount is
 * typed the way it is spoken and never needs a decimal key. Keys are enamel
 * plates on the diagram's grid, sized past the 48pt minimum because this is
 * the control people use one-handed at a till.
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;

export function Keypad({
  onDigit,
  onBackspace,
}: {
  onDigit: (digits: string) => void;
  onBackspace: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.pad}>
      {KEYS.map((key) =>
        key === 'back' ? (
          <Key key={key} accessibilityLabel="Delete last digit" onPress={onBackspace}>
            <IconBackspace size={26} color={theme.ink} />
          </Key>
        ) : (
          <Key key={key} accessibilityLabel={key} onPress={() => onDigit(key)}>
            <Text style={[styles.keyLabel, { color: theme.ink }]} maxFontSizeMultiplier={1.4}>
              {key}
            </Text>
          </Key>
        ),
      )}
    </View>
  );
}

function Key({
  children,
  accessibilityLabel,
  onPress,
}: {
  children: React.ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.key,
        {
          borderColor: theme.rule,
          backgroundColor: pressed ? theme.raised : 'transparent',
        },
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  key: {
    // Three per row, minus the two gaps.
    width: '31.8%',
    flexGrow: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.plate,
    borderWidth: Stroke.hairline,
  },
  keyLabel: {
    fontFamily: FontFamily.monoSemi,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
});
