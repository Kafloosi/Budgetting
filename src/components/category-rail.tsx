import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Space, Stroke } from '@/constants/theme';
import type { Category } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

/**
 * Choosing a category is choosing which line to travel on.
 *
 * The candidates sit on one horizontal rail; the chosen one lights its section
 * of the rail in its own colour. Horizontal because at a till the thumb is
 * already near the bottom of the screen and a grid would cost a reach.
 */
export function CategoryRail({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      accessibilityRole="radiogroup">
      {categories.map((category) => {
        const selected = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={category.name}
            style={styles.stop}>
            <View
              style={[
                styles.segment,
                { backgroundColor: selected ? category.color : theme.rule },
              ]}
            />
            <CategoryRoundel size={44} color={selected ? category.color : theme.inkFaint} icon={category.icon} />
            <Text
              variant="caption"
              tone={selected ? 'ink' : 'muted'}
              numberOfLines={2}
              style={styles.name}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    paddingHorizontal: Space.lg,
    gap: Space.xs,
  },
  stop: {
    width: 84,
    alignItems: 'center',
    gap: Space.sm,
  },
  segment: {
    height: Stroke.route,
    width: 84,
    borderRadius: Stroke.route / 2,
  },
  name: {
    textAlign: 'center',
  },
});
