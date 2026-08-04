import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Text } from '@/components/text';
import { IconTrash } from '@/components/transit/icons';
import { Line, Space } from '@/constants/theme';

const PANEL_WIDTH = 96;

/**
 * Swipe a station off the line.
 *
 * The panel behind the row is the diagram's disruption red, and it only ever
 * arms the action — the confirm still happens in a dialog, because a ledger
 * entry deleted by a stray thumb is money the user cannot get back.
 */
export function SwipeToDelete({
  children,
  onDelete,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  accessibilityLabel: string;
}) {
  const ref = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, translation) => (
        <DeletePanel
          translation={translation}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
          accessibilityLabel={accessibilityLabel}
        />
      )}>
      {children}
    </ReanimatedSwipeable>
  );
}

function DeletePanel({
  translation,
  onPress,
  accessibilityLabel,
}: {
  translation: SharedValue<number>;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  // Keeps the glyph pinned to the row's edge as the panel widens.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(0, translation.value + PANEL_WIDTH) }],
  }));

  return (
    <View style={styles.panel}>
      <Animated.View style={[styles.panelInner, style]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={styles.action}>
          <IconTrash size={22} color="#FFFFFF" />
          <Text variant="station" color="#FFFFFF">
            Delete
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: Line.scarlet,
  },
  panelInner: {
    flex: 1,
  },
  action: {
    flex: 1,
    width: PANEL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
});
