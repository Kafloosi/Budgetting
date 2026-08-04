import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { IconBack, IconClose } from '@/components/transit/icons';
import { Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The head of a modal task: what platform you are on, the way off it, and one
 * optional action. The route line under the title is the same rule every screen
 * carries, so a sheet reads as part of the same network rather than a popup.
 */
export function SheetHeader({
  title,
  accent,
  onClose,
  action,
  leading = 'close',
}: {
  title: string;
  accent: string;
  onClose: () => void;
  action?: { label: string; onPress: () => void; destructive?: boolean };
  /** `back` for a pushed screen, `close` for a modal. */
  leading?: 'close' | 'back';
}) {
  const theme = useTheme();
  const LeadingIcon = leading === 'back' ? IconBack : IconClose;

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={leading === 'back' ? 'Back' : 'Close'}
          hitSlop={8}
          style={({ pressed }) => [
            styles.close,
            { borderColor: theme.rule, backgroundColor: pressed ? theme.raised : 'transparent' },
          ]}>
          <LeadingIcon size={20} color={theme.ink} />
        </Pressable>

        <Text variant="station" style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>

        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.action}>
            <Text
              variant="station"
              color={action.destructive ? theme.onGround.scarlet : theme.onGround.cobalt}>
              {action.label}
            </Text>
          </Pressable>
        ) : (
          // Balances the close button so the title stays centred. Deliberately
          // not `styles.close`, whose border would draw an empty ring.
          <View style={styles.spacer} />
        )}
      </View>

      <View style={[styles.rule, { backgroundColor: accent }]} />
    </View>
  );
}

/** A grouped block of fields, separated from its neighbours by space, not a box. */
export function SheetSection({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.section, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  close: {
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  spacer: {
    width: TouchTarget,
    height: TouchTarget,
  },
  action: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rule: {
    height: Stroke.route,
  },
  section: {
    gap: Space.lg,
  },
});
