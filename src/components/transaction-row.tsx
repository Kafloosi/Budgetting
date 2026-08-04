import { Pressable, StyleSheet, View } from 'react-native';

import { Money } from '@/components/money';
import { Text } from '@/components/text';
import { Space, Stroke } from '@/constants/theme';
import type { TransactionWithCategory } from '@/db/repositories/transactions';
import { useTheme } from '@/hooks/use-theme';
import { useMoney } from '@/providers/settings';

/**
 * A transaction is a station on the ledger's line.
 *
 * The route runs vertically down the left edge, taking each transaction's own
 * category colour, so a day of spending reads as a journey changing lines. The
 * line joins between rows, which is why the segment above the bullet is drawn
 * only when there is a row above it.
 */
export function TransactionRow({
  transaction,
  onPress,
  first = false,
  last = false,
}: {
  transaction: TransactionWithCategory;
  onPress?: () => void;
  first?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  const money = useMoney();
  const routeColor = transaction.category_color ?? theme.inkFaint;

  const dateLabel = new Date(`${transaction.date}T00:00:00`).toLocaleDateString(money.locale, {
    day: 'numeric',
    month: 'short',
  });
  const meta = [transaction.category_name ?? 'Unassigned', dateLabel].join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${transaction.description || 'No description'}, ${money.format(
        transaction.amount_cents,
      )}, ${meta}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.raised : 'transparent' },
      ]}>
      <View style={styles.rail}>
        <View
          style={[
            styles.segment,
            { backgroundColor: first ? 'transparent' : routeColor },
          ]}
        />
        <View
          style={[
            styles.bullet,
            { borderColor: routeColor, backgroundColor: theme.ground },
          ]}
        />
        <View
          style={[
            styles.segment,
            { backgroundColor: last ? 'transparent' : routeColor },
          ]}
        />
      </View>

      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {transaction.description || 'No description'}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>

      <Money cents={transaction.amount_cents} />
    </Pressable>
  );
}

const RAIL_WIDTH = 14;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingRight: Space.xl,
    paddingLeft: Space.xl,
    minHeight: 64,
  },
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  segment: {
    flex: 1,
    width: Stroke.tick + 1,
  },
  bullet: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: Stroke.tick,
    marginVertical: 2,
  },
  body: {
    flex: 1,
    paddingVertical: Space.md,
    gap: 2,
  },
});
