import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconArrow } from '@/components/transit/icons';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Space } from '@/constants/theme';
import {
  listImportRules,
  type ImportRuleWithCategory,
} from '@/db/repositories/import-rules';
import type { RuleMatchType } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { useLedgerQuery } from '@/providers/ledger';

/** How each match type reads in a sentence about a payee. */
const MATCH_PHRASE: Record<RuleMatchType, string> = {
  contains: 'contains',
  starts_with: 'starts with',
  equals: 'is exactly',
};

/**
 * The timetable: which payee goes on which line, decided once.
 *
 * Listed in the order the rules actually resolve — priority first, then the
 * longer pattern — so the row above wins any argument with the row below it.
 * That ordering is the whole reason this is a list and not a set.
 */
export default function ImportRulesScreen() {
  const router = useRouter();

  const rules = useLedgerQuery((database) => listImportRules(database), []);
  const all = rules.data ?? [];

  return (
    <Screen>
      <SheetHeader
        title="Import rules"
        accent={Line.teal}
        leading="back"
        onClose={() => router.back()}
        action={{ label: 'New', onPress: () => router.push('/import-rule') }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {all.length === 0 ? (
          <EmptyState
            accent={Line.teal}
            title="No rules yet"
            body="A rule files a payee for you. Say once that anything mentioning your supermarket is groceries, and every statement you import after that arrives already sorted."
            action={{ label: 'Write the first rule', onPress: () => router.push('/import-rule') }}
          />
        ) : (
          <>
            <View style={styles.list}>
              {all.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onPress={() =>
                    router.push({ pathname: '/import-rule', params: { id: rule.id } })
                  }
                />
              ))}
            </View>

            <View style={styles.footer}>
              <Button
                label="New rule"
                variant="secondary"
                onPress={() => router.push('/import-rule')}
              />
              <Text variant="caption" tone="muted" style={styles.note}>
                {`${all.length} ${all.length === 1 ? 'rule' : 'rules'}, in the order they win. A rule only fills in a category that is empty — one you set by hand is never overwritten.`}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function RuleRow({
  rule,
  onPress,
}: {
  rule: ImportRuleWithCategory;
  onPress: () => void;
}) {
  const theme = useTheme();
  const name = rule.category_name ?? 'a deleted category';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit rule: description ${MATCH_PHRASE[rule.match_type]} ${rule.pattern}, filed as ${name}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.raised : 'transparent' },
      ]}>
      <CategoryRoundel
        size={32}
        color={rule.category_color ?? theme.inkFaint}
        icon={rule.category_icon ?? ''}
        name={name}
      />
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1}>
          {rule.pattern}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {`${MATCH_PHRASE[rule.match_type]} · ${name}${rule.priority > 0 ? ' · always first' : ''}`}
        </Text>
      </View>
      <IconArrow size={18} color={theme.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
    gap: Space.xxl,
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
