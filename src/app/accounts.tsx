import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Money } from '@/components/money';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconArrow } from '@/components/transit/icons';
import { StationBullet } from '@/components/transit/roundel';
import { Line, Space, Stroke } from '@/constants/theme';
import {
  ACCOUNT_KIND_LABELS,
  listAccountBalances,
  type AccountBalance,
  type AccountKind,
} from '@/db/repositories/accounts';
import { useTheme } from '@/hooks/use-theme';
import { useLedgerQuery } from '@/providers/ledger';

/**
 * Where the money sits, and how much of it is in each place.
 *
 * A balance is a plain SUM of signed amounts, which is exactly right because a
 * transfer is a pair of rows that cancel: money leaving one account and arriving
 * in another nets to nothing across the network, and to the correct figure on each
 * account.
 */
export default function AccountsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const accounts = useLedgerQuery((database) => listAccountBalances(database), []);
  const all = accounts.data ?? [];
  const total = all.reduce((sum, account) => sum + account.balance_cents, 0);

  return (
    <Screen>
      <SheetHeader
        title="Accounts"
        accent={Line.cobalt}
        leading="back"
        onClose={() => router.back()}
        action={{ label: 'New', onPress: () => router.push('/account') }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.total, { borderColor: theme.rule }]}>
          <Text variant="station" tone="muted">
            Across every account
          </Text>
          <Money cents={total} variant="display" colorIncome={false} />
        </View>

        <View style={styles.list}>
          {all.map((account) => (
            <Row
              key={account.id}
              account={account}
              onPress={() => router.push({ pathname: '/account', params: { id: account.id } })}
            />
          ))}
        </View>

        <View style={styles.footer}>
          {all.length > 1 ? (
            <Button label="Move money between accounts" onPress={() => router.push('/transfer')} />
          ) : null}
          <Button label="New account" variant="secondary" onPress={() => router.push('/account')} />
          <Text variant="caption" tone="muted" style={styles.note}>
            A balance is everything logged on that account added up. It is not a figure
            fetched from a bank — Fare never connects to one.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ account, onPress }: { account: AccountBalance; onPress: () => void }) {
  const theme = useTheme();
  const kind = ACCOUNT_KIND_LABELS[account.kind as AccountKind] ?? account.kind;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${kind}. Edit.`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.raised : 'transparent' },
      ]}>
      <StationBullet size={12} color={theme.inkFaint} filled={false} />
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1}>
          {account.name}
        </Text>
        <Text variant="caption" tone="faint">
          {`${kind} · ${account.transaction_count} ${account.transaction_count === 1 ? 'entry' : 'entries'}`}
        </Text>
      </View>
      <Money cents={account.balance_cents} variant="amount" colorIncome={false} />
      <IconArrow size={18} color={theme.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
    gap: Space.xl,
  },
  total: {
    marginHorizontal: Space.xl,
    paddingVertical: Space.lg,
    borderTopWidth: Stroke.route,
    gap: Space.xs,
  },
  list: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 56,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  footer: {
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  note: {
    textAlign: 'center',
  },
});
