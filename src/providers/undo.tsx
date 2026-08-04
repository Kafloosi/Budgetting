import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { IconBack } from '@/components/transit/icons';
import { Elevation, Line, Motion, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Long enough to notice the mistake, short enough not to sit in the way. */
const WINDOW_MS = 5000;

interface UndoValue {
  /** Shows the bar. `undo` runs if the user takes it back in time. */
  offer: (message: string, undo: () => void | Promise<void>) => void;
}

const UndoContext = createContext<UndoValue | null>(null);

interface Offer {
  id: number;
  message: string;
  undo: () => void | Promise<void>;
}

/**
 * The undo bar.
 *
 * A deletion in a ledger is the one action people regret immediately, so it is
 * offered back for a few seconds rather than guarded by a second dialog before
 * the fact. Whatever is not taken back is still recoverable from the trash for
 * thirty days.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [offerState, setOffer] = useState<Offer | null>(null);
  const nextId = useRef(0);

  const offer = useCallback((message: string, undo: () => void | Promise<void>) => {
    nextId.current += 1;
    setOffer({ id: nextId.current, message, undo });
  }, []);

  useEffect(() => {
    if (!offerState) return;
    const timer = setTimeout(() => setOffer(null), WINDOW_MS);
    return () => clearTimeout(timer);
  }, [offerState]);

  const value = useMemo(() => ({ offer }), [offer]);

  return (
    <UndoContext value={value}>
      {children}
      {offerState ? (
        <UndoBar
          key={offerState.id}
          message={offerState.message}
          onUndo={async () => {
            setOffer(null);
            await offerState.undo();
          }}
        />
      ) : null}
    </UndoContext>
  );
}

export function useUndo(): UndoValue {
  const value = use(UndoContext);
  if (!value) throw new Error('useUndo must be used inside <UndoProvider>');
  return value;
}

function UndoBar({ message, onUndo }: { message: string; onUndo: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={FadeInDown.duration(Motion.quick).easing(Easing.bezier(...Motion.ease))}
      exiting={FadeOutDown.duration(Motion.quick)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <View
        style={[
          styles.bar,
          Elevation,
          { backgroundColor: theme.raised, borderColor: theme.rule },
        ]}
        accessibilityLiveRegion="polite">
        <View style={[styles.stripe, { backgroundColor: Line.scarlet }]} />
        <Text variant="label" numberOfLines={2} style={styles.message}>
          {message}
        </Text>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo the delete"
          hitSlop={8}
          style={styles.action}>
          <IconBack size={18} color={theme.onGround.cobalt} />
          <Text variant="station" color={theme.onGround.cobalt}>
            Undo
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Space.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingRight: Space.lg,
    borderRadius: Radius.panel,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
    minHeight: TouchTarget + 8,
  },
  stripe: {
    width: Stroke.route,
    alignSelf: 'stretch',
  },
  message: {
    flex: 1,
    paddingVertical: Space.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
});
