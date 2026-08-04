import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Screen, SectionLabel } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { MonthBars } from '@/components/transit/month-bars';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import {
  getMonthBars,
  getYearCategorySpend,
  getYearTotals,
  listYearsWithData,
} from '@/db/repositories/stats';
import { getCategorySpend } from '@/db/repositories/transactions';
import { toMonthKey } from '@/db/util';
import { useTheme } from '@/hooks/use-theme';
import { useLedgerQuery } from '@/providers/ledger';
import { useMoney } from '@/providers/settings';

type Span = 'months' | 'year';

/**
 * The network over time.
 *
 * Six months against one datum, or a whole year broken down by line. Both
 * answer the question the Month screen cannot: is this month normal?
 */
export default function StatsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const money = useMoney();
  const [span, setSpan] = useState<Span>('months');

  const currentMonth = toMonthKey(new Date());
  const years = useLedgerQuery((db) => listYearsWithData(db), []);
  const [year, setYear] = useState(() => currentMonth.slice(0, 4));

  const bars = useLedgerQuery((db) => getMonthBars(db, currentMonth, 6), [currentMonth]);
  const monthSpend = useLedgerQuery((db) => getCategorySpend(db, currentMonth), [currentMonth]);
  const yearTotals = useLedgerQuery((db) => getYearTotals(db, year), [year]);
  const yearSpend = useLedgerQuery((db) => getYearCategorySpend(db, year), [year]);

  const spend = span === 'months' ? (monthSpend.data ?? []) : (yearSpend.data ?? []);
  const spendTotal = spend.reduce((sum, entry) => sum + entry.spent_cents, 0);
  const empty = (bars.data ?? []).every((bar) => bar.income_cents === 0 && bar.expense_cents === 0);

  return (
    <Screen>
      <SheetHeader
        title="Network stats"
        accent={Line.cobalt}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.spans} accessibilityRole="radiogroup">
          <SpanPlate label="Six months" active={span === 'months'} onPress={() => setSpan('months')} />
          <SpanPlate label="Full year" active={span === 'year'} onPress={() => setSpan('year')} />
        </View>

        {empty ? (
          <EmptyState
            accent={Line.cobalt}
            title="Nothing to compare yet"
            body="Once a couple of months have transactions in them, this is where you see whether the current one is normal."
          />
        ) : span === 'months' ? (
          <View style={styles.section}>
            <SectionLabel>Last six months</SectionLabel>
            <View style={styles.chart}>
              <MonthBars bars={bars.data ?? []} selected={currentMonth} />
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <SectionLabel>{year}</SectionLabel>
            <View style={styles.yearTotals}>
              <Total label="In" cents={yearTotals.data?.income_cents ?? 0} />
              <View style={[styles.divider, { backgroundColor: theme.rule }]} />
              <Total label="Out" cents={-(yearTotals.data?.expense_cents ?? 0)} />
              <View style={[styles.divider, { backgroundColor: theme.rule }]} />
              <Total label="Net" cents={yearTotals.data?.net_cents ?? 0} />
            </View>

            {(years.data ?? []).length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.years}>
                {(years.data ?? []).map((candidate) => (
                  <Pressable
                    key={candidate}
                    onPress={() => setYear(candidate)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: candidate === year }}
                    style={({ pressed }) => [
                      styles.yearChip,
                      {
                        borderColor: candidate === year ? Line.cobalt : theme.rule,
                        backgroundColor: pressed ? theme.raised : 'transparent',
                      },
                    ]}>
                    <Text variant="station" tone={candidate === year ? 'ink' : 'muted'}>
                      {candidate}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        )}

        {spend.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>
              {span === 'months' ? 'This month by line' : 'By line'}
            </SectionLabel>
            {spend.map((entry) => {
              const share = spendTotal > 0 ? entry.spent_cents / spendTotal : 0;
              return (
                <View key={entry.category_id ?? 'none'} style={styles.breakdown}>
                  <View style={styles.breakdownHead}>
                    <CategoryRoundel
                      size={26}
                      color={entry.category_color ?? theme.inkFaint}
                      icon={entry.category_icon}
                    />
                    <Text variant="body" numberOfLines={1} style={styles.breakdownName}>
                      {entry.category_name ?? 'Unassigned'}
                    </Text>
                    <Text variant="amountSmall" tone="muted">
                      {`${Math.round(share * 100)}%`}
                    </Text>
                    <Money cents={-entry.spent_cents} variant="amount" colorIncome={false} />
                  </View>
                  <View style={[styles.shareTrack, { backgroundColor: theme.rule }]}>
                    <View
                      style={[
                        styles.shareFill,
                        {
                          width: `${Math.max(2, share * 100)}%`,
                          backgroundColor: entry.category_color ?? theme.inkFaint,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
            <Text variant="caption" tone="muted" style={styles.footnote}>
              {`${money.formatAbs(spendTotal)} out across ${spend.length} ${
                spend.length === 1 ? 'line' : 'lines'
              }.`}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <View style={styles.total}>
      <Text variant="station" tone="muted">
        {label}
      </Text>
      <Money cents={cents} variant="amount" colorIncome={cents > 0} />
    </View>
  );
}

function SpanPlate({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.plate,
        {
          borderColor: active ? theme.ink : theme.rule,
          backgroundColor: pressed ? theme.raised : 'transparent',
        },
      ]}>
      <View
        style={[
          styles.plateBullet,
          {
            borderColor: active ? theme.ink : theme.inkFaint,
            backgroundColor: active ? theme.ink : 'transparent',
          },
        ]}
      />
      <Text variant="station" tone={active ? 'ink' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: Space.xl,
    gap: Space.xxl,
  },
  spans: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  plate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  plateBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
  },
  section: {
    gap: Space.md,
  },
  chart: {
    paddingHorizontal: Space.xl,
  },
  yearTotals: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
  },
  total: {
    flex: 1,
    gap: 2,
  },
  divider: {
    width: Stroke.hairline,
    alignSelf: 'stretch',
    marginHorizontal: Space.md,
  },
  years: {
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  yearChip: {
    minHeight: TouchTarget - 8,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  breakdown: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  breakdownHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  breakdownName: {
    flex: 1,
  },
  shareTrack: {
    height: Stroke.route,
    borderRadius: Stroke.route / 2,
    overflow: 'hidden',
  },
  shareFill: {
    height: Stroke.route,
    borderRadius: Stroke.route / 2,
  },
  footnote: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
  },
});
