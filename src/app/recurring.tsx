import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Screen, SectionLabel } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Space, Stroke } from '@/constants/theme';
import { FREQUENCY_LABELS, listRecurring, nextOccurrence } from '@/db/repositories/recurring';
import { useTheme } from '@/hooks/use-theme';
import { useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

/**
 * The timetable — entries that run on their own.
 *
 * Rent, salary, subscriptions: the things that happen whether or not anybody
 * opens the app. Each rule shows when it next runs, because a schedule you
 * cannot check is a schedule you cannot trust.
 */
export default function RecurringScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const rules = useLedgerQuery((db) => listRecurring(db), []);

  const all = rules.data ?? [];

  return (
    <Screen>
      <SheetHeader
        title="Timetable"
        accent={Line.violet}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {all.length === 0 ? (
          <EmptyState
            accent={Line.violet}
            title="Nothing scheduled"
            body="Put rent, salary or a subscription on the timetable and Fare logs it for you, catching up on anything due while the app was closed."
            action={{ label: 'Add a scheduled entry', onPress: () => router.push('/recurring-rule') }}
          />
        ) : (
          <View style={styles.section}>
            <SectionLabel>In service</SectionLabel>
            {all.map((rule) => {
              const next = nextOccurrence(rule);
              const nextLabel = new Date(`${next}T00:00:00`).toLocaleDateString(money.locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
              });
              return (
                <Pressable
                  key={rule.id}
                  onPress={() =>
                    router.push({ pathname: '/recurring-rule', params: { id: rule.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${rule.description || 'scheduled entry'}. ${
                    FREQUENCY_LABELS[rule.frequency]
                  }, next on ${nextLabel}.`}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.raised : 'transparent' },
                  ]}>
                  <CategoryRoundel
                    size={32}
                    color={rule.category_color ?? theme.inkFaint}
                    icon={rule.category_icon}
                    name={rule.category_name}
                  />
                  <View style={styles.body}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {rule.description || 'No description'}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {`${FREQUENCY_LABELS[rule.frequency]}  ·  next ${nextLabel}`}
                    </Text>
                  </View>
                  <Money cents={rule.amount_cents} />
                </Pressable>
              );
            })}
          </View>
        )}

        {all.length > 0 ? (
          <View style={styles.footer}>
            <Button
              label="New scheduled entry"
              onPress={() => router.push('/recurring-rule')}
              variant="secondary"
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.xl,
    gap: Space.xl,
  },
  section: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 64,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  footer: {
    paddingHorizontal: Space.xl,
    borderTopWidth: Stroke.hairline,
    borderTopColor: 'transparent',
  },
});
