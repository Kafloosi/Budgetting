import { useRouter } from 'expo-router';
import { TabTrigger } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import {
  IconAdd,
  IconInterchange,
  IconLedger,
  IconPoints,
  IconTerminus,
  type IconProps,
} from '@/components/transit/icons';
import { Elevation, Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The navigation bar is the network's trunk line.
 *
 * A route runs across the top edge of the bar; each destination hangs off it on
 * a tick, and the one you are at is drawn as a lit station — scarlet tick,
 * filled glyph, ink label. Logging money is not a destination, so it is the
 * interchange sitting on the line itself.
 *
 * It behaves exactly like a platform tab bar underneath: same place, same
 * count, same tap semantics, 48pt targets, bottom inset respected.
 */

interface TabDestination {
  name: string;
  label: string;
  Icon: (props: IconProps) => React.ReactElement;
}

const DESTINATIONS: TabDestination[] = [
  { name: 'index', label: 'Month', Icon: IconInterchange },
  { name: 'ledger', label: 'Ledger', Icon: IconLedger },
  { name: 'budgets', label: 'Budgets', Icon: IconTerminus },
  { name: 'settings', label: 'Settings', Icon: IconPoints },
];

export function TransitTabBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const left = DESTINATIONS.slice(0, 2);
  const right = DESTINATIONS.slice(2);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.raised,
          borderTopColor: theme.rule,
          paddingBottom: Math.max(insets.bottom, Space.sm),
        },
      ]}>
      <View style={styles.row}>
        {left.map((destination) => (
          <TabTrigger key={destination.name} name={destination.name} asChild>
            <Destination destination={destination} />
          </TabTrigger>
        ))}

        <Pressable
          onPress={() => router.push('/entry')}
          accessibilityRole="button"
          accessibilityLabel="Add a transaction"
          accessibilityHint="Opens the keypad to log money in or out"
          style={({ pressed }) => [
            styles.interchange,
            Elevation,
            { backgroundColor: Line.scarlet, borderColor: theme.raised, opacity: pressed ? 0.85 : 1 },
          ]}>
          <IconAdd size={26} color="#FFFFFF" />
        </Pressable>

        {right.map((destination) => (
          <TabTrigger key={destination.name} name={destination.name} asChild>
            <Destination destination={destination} />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
}

/**
 * `asChild` forwards the trigger's press handling and its `isFocused` flag onto
 * this component, so the rest of the props are spread straight through to the
 * Pressable rather than reimplemented.
 */
function Destination({
  destination,
  isFocused,
  ...pressableProps
}: {
  destination: TabDestination;
  isFocused?: boolean;
} & React.ComponentProps<typeof Pressable>) {
  const theme = useTheme();
  const { Icon, label } = destination;
  const active = Boolean(isFocused);
  const color = active ? Line.scarlet : theme.inkMuted;

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={styles.destination}>
      <View style={styles.destinationInner}>
        <View
          style={[
            styles.tick,
            { backgroundColor: active ? Line.scarlet : theme.rule, height: active ? 14 : 8 },
          ]}
        />
        <Icon size={24} color={color} filled={active} />
        <Text
          variant="station"
          color={active ? theme.ink : theme.inkMuted}
          numberOfLines={1}
          style={styles.label}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: Stroke.route,
    paddingTop: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
  },
  destination: {
    flex: 1,
    minHeight: TouchTarget,
  },
  destinationInner: {
    alignItems: 'center',
    gap: Space.xs,
  },
  tick: {
    width: Stroke.tick,
    borderRadius: 1,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1,
  },
  interchange: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick * 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    marginHorizontal: Space.xs,
  },
});
