import type { StyleProp, TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { useMoney } from '@/providers/settings';
import { useTheme } from '@/hooks/use-theme';

/**
 * An amount, in the user's currency, set in the mono face so digits stay in
 * their columns down a list. Income is the only thing that takes a colour —
 * money arriving is the exception worth marking.
 */
export function Money({
  cents,
  variant = 'amount',
  tone,
  colorIncome = true,
  signDisplay = 'auto',
  style,
}: {
  cents: number;
  variant?: 'display' | 'amount' | 'amountSmall';
  tone?: 'ink' | 'muted' | 'faint';
  colorIncome?: boolean;
  signDisplay?: 'auto' | 'always' | 'never';
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  const money = useMoney();
  const income = cents > 0;

  return (
    <Text
      variant={variant}
      tone={tone ?? 'ink'}
      color={colorIncome && income ? theme.onGround.green : undefined}
      style={style}
      // The formatted string already reads correctly; stop screen readers
      // spelling out the separators character by character.
      accessibilityLabel={money.format(cents, signDisplay)}>
      {money.format(cents, signDisplay)}
    </Text>
  );
}
