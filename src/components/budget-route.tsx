import { Pressable, StyleSheet, View } from 'react-native';

import { Money } from '@/components/money';
import { Text } from '@/components/text';
import { CategoryRoundel } from '@/components/transit/roundel';
import { RouteLine } from '@/components/transit/route';
import { Space } from '@/constants/theme';
import type { BudgetProgress } from '@/db/repositories/budgets';
import { useTheme } from '@/hooks/use-theme';
import { useMoney } from '@/providers/settings';

/**
 * One category's month, drawn as a length of route.
 *
 * Status is written as well as drawn — a route running into its run-out is the
 * fast read, the sentence underneath is the one that survives a colour-blind
 * user, a greyscale screenshot, or a screen reader.
 */
export function BudgetRoute({
  progress,
  onPress,
  animate = true,
}: {
  progress: BudgetProgress;
  onPress?: () => void;
  animate?: boolean;
}) {
  const theme = useTheme();
  const money = useMoney();

  const status =
    progress.status === 'over'
      ? `${money.formatAbs(progress.remaining_cents)} over the limit`
      : progress.status === 'warning'
        ? `${money.formatAbs(progress.remaining_cents)} left — close to the limit`
        : `${money.formatAbs(progress.remaining_cents)} left`;

  const statusColor =
    progress.status === 'over'
      ? theme.onGround.scarlet
      : progress.status === 'warning'
        ? theme.onGround.amber
        : theme.inkMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${progress.category_name}: ${money.formatAbs(
        progress.spent_cents,
      )} of ${money.formatAbs(progress.limit_cents)} spent. ${status}.`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.raised : 'transparent' },
      ]}>
      <View style={styles.head}>
        <CategoryRoundel size={32} color={progress.category_color} icon={progress.category_icon} />
        <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
          {progress.category_name}
        </Text>
        <View style={styles.amounts}>
          <Money cents={-progress.spent_cents} variant="amount" colorIncome={false} signDisplay="never" />
          <Text variant="amountSmall" tone="faint">
            {` / ${money.plain(progress.limit_cents)}`}
          </Text>
        </View>
      </View>

      <RouteLine
        color={progress.category_color}
        ratio={progress.ratio}
        status={progress.status}
        animate={animate}
      />

      <Text variant="caption" color={statusColor}>
        {status}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  name: {
    // Wraps the amounts onto their own line rather than truncating a category
    // name, which is the one thing on this row the user chose themselves.
    flex: 1,
    minWidth: 140,
  },
  amounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 'auto',
  },
});
