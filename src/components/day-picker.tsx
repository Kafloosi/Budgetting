import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { IconArrow, IconBack } from '@/components/transit/icons';
import { Elevation, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import type { DateOnly } from '@/db/types';
import { toDateOnly } from '@/db/util';
import { useTheme } from '@/hooks/use-theme';
import { useMoney } from '@/providers/settings';

/**
 * The day a transaction happened.
 *
 * Almost every entry is today or yesterday, so those are one tap. Anything
 * older opens a month of days laid out as station bullets — the same grammar
 * as the rest of the app, and quicker than spinning a wheel.
 */
export function DayPicker({
  value,
  onChange,
  accent,
}: {
  value: DateOnly;
  onChange: (date: DateOnly) => void;
  accent: string;
}) {
  const theme = useTheme();
  const money = useMoney();
  const [open, setOpen] = useState(false);

  const today = toDateOnly(new Date());
  // Stepping the calendar date rather than subtracting 24 hours, so the day
  // before a clock change is still the day before.
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  const yesterday = toDateOnly(previous);

  const label = new Date(`${value}T00:00:00`).toLocaleDateString(money.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.wrap}>
      <Text variant="station" tone="muted" style={styles.label}>
        Day
      </Text>
      <View style={styles.chips}>
        <Chip label="Today" active={value === today} onPress={() => onChange(today)} accent={accent} />
        <Chip
          label="Yesterday"
          active={value === yesterday}
          onPress={() => onChange(yesterday)}
          accent={accent}
        />
        <Chip
          label={value === today || value === yesterday ? 'Another day' : label}
          active={value !== today && value !== yesterday}
          onPress={() => setOpen(true)}
          accent={accent}
        />
      </View>

      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
        accessibilityViewIsModal>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <Pressable
            style={[
              styles.card,
              Elevation,
              { backgroundColor: theme.raised, borderColor: theme.rule },
            ]}
            onPress={() => {}}>
            <Calendar
              value={value}
              accent={accent}
              onPick={(date) => {
                onChange(date);
                setOpen(false);
              }}
            />
            <Button
              label="Close"
              variant="quiet"
              showArrow={false}
              onPress={() => setOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? accent : theme.rule,
          backgroundColor: pressed ? theme.raised : 'transparent',
        },
      ]}>
      <View
        style={[
          styles.chipBullet,
          { borderColor: active ? accent : theme.inkFaint, backgroundColor: active ? accent : 'transparent' },
        ]}
      />
      <Text variant="label" tone={active ? 'ink' : 'muted'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Calendar({
  value,
  onPick,
  accent,
}: {
  value: DateOnly;
  onPick: (date: DateOnly) => void;
  accent: string;
}) {
  const theme = useTheme();
  const money = useMoney();
  const selected = new Date(`${value}T00:00:00`);
  const [cursor, setCursor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first, which is what every locale this app ships to uses in print.
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const title = cursor.toLocaleDateString(money.locale, { month: 'long', year: 'numeric' });
  const today = toDateOnly(new Date());

  return (
    <View style={styles.calendar}>
      <View style={styles.calendarHead}>
        <Pressable
          onPress={() => setCursor(new Date(year, month - 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={styles.calendarStep}>
          <IconBack size={20} color={theme.ink} />
        </Pressable>
        <Text variant="station" style={styles.calendarTitle} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          onPress={() => setCursor(new Date(year, month + 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          style={styles.calendarStep}>
          <IconArrow size={20} color={theme.ink} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {Array.from({ length: leading }).map((_, index) => (
          <View key={`pad-${index}`} style={styles.day} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const date = toDateOnly(new Date(year, month, day));
          const isSelected = date === value;
          const isToday = date === today;
          return (
            <Pressable
              key={date}
              onPress={() => onPick(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={new Date(`${date}T00:00:00`).toLocaleDateString(money.locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              style={styles.day}>
              <View
                style={[
                  styles.dayBullet,
                  {
                    borderColor: isSelected ? accent : isToday ? theme.ink : 'transparent',
                    backgroundColor: isSelected ? accent : 'transparent',
                  },
                ]}>
                <Text
                  variant="caption"
                  color={isSelected ? '#FFFFFF' : theme.ink}
                  maxFontSizeMultiplier={1.3}>
                  {String(day)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Space.sm,
  },
  label: {
    paddingLeft: Space.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  chipBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Radius.sheet,
    borderWidth: Stroke.hairline,
    padding: Space.lg,
    gap: Space.lg,
  },
  calendar: {
    gap: Space.md,
  },
  calendarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  calendarStep: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarTitle: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  day: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBullet: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
