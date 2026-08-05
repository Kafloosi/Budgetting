import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/field';
import { Plate } from '@/components/plate';
import { Screen } from '@/components/screen';
import { SheetHeader } from '@/components/sheet';
import { Text } from '@/components/text';
import { CategoryRoundel } from '@/components/transit/roundel';
import { Line, LineOrder, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import {
  createCategory,
  deleteCategory,
  getCategory,
  updateCategory,
} from '@/db/repositories/categories';
import type { CategoryKind } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { useInvalidateLedger, useLedgerQuery } from '@/providers/ledger';

/** Emoji people reach for first. The field takes anything they type instead. */
const SUGGESTED = ['🛒', '🍽️', '🚆', '🏠', '💡', '💊', '📺', '👕', '🎬', '✈️', '🐾', '📦', '💰', '🎁'];

/**
 * Opening a new line, or renaming one.
 *
 * Colour is picked from the network's six, not a full spectrum: a diagram with
 * forty hues is a diagram nobody can read.
 */
export default function CategoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const db = useSQLiteContext();
  const invalidate = useInvalidateLedger();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [color, setColor] = useState<string>(Line.cobalt);
  const [icon, setIcon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  const existing = useLedgerQuery(
    (database) => (id ? getCategory(database, id) : Promise.resolve(null)),
    [id],
  );

  const loaded = existing.data;
  if (loaded && prefilled !== loaded.id) {
    setPrefilled(loaded.id);
    setName(loaded.name);
    setKind(loaded.kind);
    setColor(loaded.color);
    setIcon(loaded.icon);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the line a name so you can find it on the keypad.');
      return;
    }
    if (id) {
      await updateCategory(db, id, { name: trimmed, kind, color, icon });
    } else {
      await createCategory(db, { name: trimmed, kind, color, icon });
    }
    invalidate();
    router.back();
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(
      `Close ${name}?`,
      'Its transactions stay in the ledger but lose their category, and any limit on it is removed. Archiving instead keeps the history readable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close the line',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(db, id);
            invalidate();
            router.back();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SheetHeader
        title={id ? 'Edit category' : 'New category'}
        accent={color}
        onClose={() => router.back()}
        action={id ? { label: 'Delete', onPress: confirmDelete, destructive: true } : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.preview}>
          <CategoryRoundel size={56} color={color} icon={icon} name={name || undefined} />
          <View style={[styles.previewLine, { backgroundColor: color }]} />
          <Text variant="bodyStrong" numberOfLines={1} style={styles.previewName}>
            {name.trim() || 'Unnamed line'}
          </Text>
        </View>

        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          placeholder="Groceries, Rent, Coffee…"
          error={error ?? undefined}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            Direction
          </Text>
          <View style={styles.kinds} accessibilityRole="radiogroup">
            <Plate
              style={styles.plate}
              label="Spending"
              active={kind === 'expense'}
              onPress={() => setKind('expense')}
            />
            <Plate
              style={styles.plate}
              label="Income"
              active={kind === 'income'}
              onPress={() => setKind('income')}
            />
          </View>
        </View>

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            Line colour
          </Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {LineOrder.map((candidate) => (
              <Pressable
                key={candidate}
                onPress={() => setColor(candidate)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === candidate }}
                accessibilityLabel={COLOUR_NAMES[candidate] ?? candidate}
                style={styles.swatchHit}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: candidate,
                      borderColor: color === candidate ? theme.ink : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text variant="station" tone="muted" style={styles.groupLabel}>
            Icon
          </Text>
          <View style={styles.emoji}>
            {SUGGESTED.map((candidate) => (
              <Pressable
                key={candidate}
                onPress={() => setIcon(candidate)}
                accessibilityRole="radio"
                accessibilityState={{ selected: icon === candidate }}
                accessibilityLabel={`Icon ${candidate}`}
                style={[
                  styles.emojiHit,
                  {
                    borderColor: icon === candidate ? color : theme.rule,
                  },
                ]}>
                <Text style={styles.emojiGlyph} allowFontScaling={false}>
                  {candidate}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextField
            label="Or type one"
            value={icon}
            onChangeText={(value) => setIcon([...value].slice(0, 2).join(''))}
            placeholder="📍"
            maxLength={4}
          />
        </View>

        <Button label={id ? 'Save changes' : 'Open the line'} onPress={save} />
      </ScrollView>
    </Screen>
  );
}

const COLOUR_NAMES: Record<string, string> = {
  [Line.scarlet]: 'Scarlet',
  [Line.cobalt]: 'Cobalt',
  [Line.amber]: 'Amber',
  [Line.green]: 'Green',
  [Line.violet]: 'Violet',
  [Line.teal]: 'Teal',
};

const styles = StyleSheet.create({
  content: {
    padding: Space.lg,
    paddingBottom: Space.xxxl,
    gap: Space.xl,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  previewLine: {
    width: 40,
    height: Stroke.route,
  },
  previewName: {
    flex: 1,
    marginLeft: Space.md,
  },
  group: {
    gap: Space.sm,
  },
  groupLabel: {
    paddingLeft: Space.xs,
  },
  kinds: {
    flexDirection: 'row',
    gap: Space.sm,
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
  swatches: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  swatchHit: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
  },
  emoji: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  emojiHit: {
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.plate,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 22,
    lineHeight: 28,
  },
});
