import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen, SectionLabel } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { IconArrow } from '@/components/transit/icons';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, Space, Stroke } from '@/constants/theme';
import { listCategories, updateCategory } from '@/db/repositories/categories';
import type { Category } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';

/**
 * The network's lines: every category, expense and income, archived included.
 *
 * Archiving rather than deleting is the default action, because a category that
 * disappears takes the meaning of last year's transactions with it.
 */
export default function CategoriesScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();

  const categories = useLedgerQuery(
    (database) => listCategories(database, { includeArchived: true }),
    [],
  );

  const all = categories.data ?? [];
  const expense = all.filter((category) => category.kind === 'expense' && !category.archived);
  const income = all.filter((category) => category.kind === 'income' && !category.archived);
  const archived = all.filter((category) => category.archived);

  async function toggleArchive(category: Category) {
    const archiving = !category.archived;
    if (archiving) {
      Alert.alert(
        `Take ${category.name} out of service?`,
        'It stays on every transaction that already uses it, but stops appearing when you log something new.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            onPress: async () => {
              await updateCategory(db, category.id, { archived: true });
              invalidate();
            },
          },
        ],
      );
      return;
    }
    await updateCategory(db, category.id, { archived: false });
    invalidate();
  }

  return (
    <Screen>
      <SheetHeader
        title="Categories"
        accent={Line.violet}
        leading="back"
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Spending" categories={expense} onEdit={(id) => router.push({ pathname: '/category', params: { id } })} onArchive={toggleArchive} />
        <Section title="Income" categories={income} onEdit={(id) => router.push({ pathname: '/category', params: { id } })} onArchive={toggleArchive} />
        {archived.length > 0 ? (
          <Section
            title="Out of service"
            categories={archived}
            onEdit={(id) => router.push({ pathname: '/category', params: { id } })}
            onArchive={toggleArchive}
          />
        ) : null}

        <View style={styles.footer}>
          <Button label="New category" onPress={() => router.push('/category')} variant="secondary" />
          <Text variant="caption" tone="muted" style={styles.note}>
            {`${all.length} in the network. Archiving keeps a category on the transactions that already use it.`}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  categories,
  onEdit,
  onArchive,
}: {
  title: string;
  categories: Category[];
  onEdit: (id: string) => void;
  onArchive: (category: Category) => void;
}) {
  const theme = useTheme();
  if (categories.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionLabel>{title}</SectionLabel>
      {categories.map((category) => (
        <View key={category.id} style={styles.row}>
          <Pressable
            onPress={() => onEdit(category.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${category.name}`}
            style={({ pressed }) => [
              styles.rowMain,
              { backgroundColor: pressed ? theme.raised : 'transparent' },
            ]}>
            <CategoryRoundel
              size={32}
              color={category.archived ? theme.inkFaint : category.color}
              icon={category.icon}
            />
            <Text
              variant="body"
              tone={category.archived ? 'muted' : 'ink'}
              numberOfLines={1}
              style={styles.name}>
              {category.name}
            </Text>
            <IconArrow size={18} color={theme.inkMuted} />
          </Pressable>
          <Pressable
            onPress={() => onArchive(category)}
            accessibilityRole="button"
            accessibilityLabel={
              category.archived ? `Put ${category.name} back in service` : `Archive ${category.name}`
            }
            hitSlop={6}
            style={styles.archive}>
            <Text variant="station" color={theme.onGround.cobalt}>
              {category.archived ? 'Restore' : 'Archive'}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
    gap: Space.xxl,
  },
  section: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingLeft: Space.xl,
    paddingRight: Space.sm,
    paddingVertical: Space.md,
    minHeight: 56,
  },
  name: {
    flex: 1,
  },
  archive: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: Space.xl,
    gap: Space.md,
    borderTopWidth: Stroke.hairline,
    borderTopColor: 'transparent',
  },
  note: {
    textAlign: 'center',
  },
});
