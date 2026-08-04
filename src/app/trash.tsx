import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import {
  TRASH_RETENTION_DAYS,
  listTrash,
  purgeAll,
  restoreTransaction,
} from '@/db/repositories/trash';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

/**
 * Out of service — deleted entries, still recoverable.
 *
 * Rows are soft-deleted everywhere in the app, so nothing here has actually
 * gone yet. They sweep themselves after thirty days on the next app open.
 */
export default function TrashScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const trash = useLedgerQuery((database) => listTrash(database), []);

  const rows = trash.data ?? [];

  async function restore(id: string) {
    await restoreTransaction(db, id);
    haptics.saved();
    invalidate();
  }

  function confirmEmpty() {
    Alert.alert(
      'Empty the siding?',
      `${rows.length} ${rows.length === 1 ? 'entry is' : 'entries are'} still recoverable. This removes them for good.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Empty',
          style: 'destructive',
          onPress: async () => {
            await purgeAll(db);
            haptics.removed();
            invalidate();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SheetHeader
        title="Out of service"
        accent={Line.scarlet}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <EmptyState
            accent={Line.scarlet}
            title="Nothing deleted"
            body={`Deleted entries wait here for ${TRASH_RETENTION_DAYS} days before they are removed for good.`}
          />
        ) : (
          <>
            <Text variant="caption" tone="muted" style={styles.note}>
              {`Deleted entries are kept for ${TRASH_RETENTION_DAYS} days, then removed automatically.`}
            </Text>

            {rows.map((row) => (
              <View key={row.id} style={styles.row}>
                <CategoryRoundel
                  size={30}
                  color={row.category_color ?? theme.inkFaint}
                  icon={row.category_icon}
                />
                <View style={styles.body}>
                  <Text variant="label" numberOfLines={1}>
                    {row.description || 'No description'}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {`${row.date}  ·  ${row.days_left} ${row.days_left === 1 ? 'day' : 'days'} left`}
                  </Text>
                </View>
                <Money cents={row.amount_cents} variant="amountSmall" tone="muted" colorIncome={false} />
                <Pressable
                  onPress={() => restore(row.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${row.description || 'transaction'} of ${money.format(
                    row.amount_cents,
                  )}`}
                  style={({ pressed }) => [
                    styles.restore,
                    {
                      borderColor: theme.rule,
                      backgroundColor: pressed ? theme.raised : 'transparent',
                    },
                  ]}>
                  <Text variant="station" color={theme.onGround.cobalt}>
                    Restore
                  </Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.footer}>
              <Button
                label="Empty the siding"
                onPress={confirmEmpty}
                variant="danger"
                showArrow={false}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.xl,
    gap: Space.xs,
  },
  note: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 60,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  restore: {
    minHeight: TouchTarget - 10,
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  footer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.xl,
  },
});
