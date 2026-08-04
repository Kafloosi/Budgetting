import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { FontFamily, Line, Space, Stroke } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The roundel — a ring struck through by a bar. It is the product's mark, the
 * shape a category takes in a list, and the shape a station takes on a route.
 */
export function Roundel({
  size = 28,
  color = Line.scarlet,
  barColor,
}: {
  size?: number;
  color?: string;
  /** Defaults to the surface ink, as the enamel bar does on a real sign. */
  barColor?: string;
}) {
  const theme = useTheme();
  const ring = Math.max(2, size * 0.16);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 1.16,
          height: ring,
          backgroundColor: barColor ?? theme.ink,
        }}
      />
    </View>
  );
}

/** Fare, set as it appears on the station wall. */
export function Wordmark({ size = 26 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.wordmark}>
      <Roundel size={size} />
      <Text
        style={{
          fontFamily: FontFamily.sansHeavy,
          fontSize: size * 0.86,
          letterSpacing: size * 0.1,
          lineHeight: size,
          color: theme.ink,
        }}
        accessibilityRole="header">
        FARE
      </Text>
    </View>
  );
}

/**
 * A station on a route. Open by default; filled once it has been called at —
 * which is how the tab bar shows the screen you are on.
 */
export function StationBullet({
  size = 12,
  color,
  filled = false,
}: {
  size?: number;
  color: string;
  filled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Stroke.tick,
        borderColor: color,
        backgroundColor: filled ? color : theme.ground,
      }}
    />
  );
}

/**
 * A category, in its own route colour.
 *
 * Empty by default it would be a bare ring, so it falls back to the line's
 * letter — which is how real networks name their lines, and which keeps the
 * six-colour palette intact. An emoji only appears when the user chose one; it
 * is their content, not this app's icon system.
 */
export function CategoryRoundel({
  size = 36,
  color,
  icon,
  name,
}: {
  size?: number;
  color: string;
  icon?: string | null;
  /** Supplies the line letter when there is no emoji. */
  name?: string | null;
}) {
  const letter = name?.trim()?.[0]?.toUpperCase() ?? null;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(2, size * 0.11),
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {icon ? (
        <Text
          style={{ fontSize: size * 0.44, lineHeight: size * 0.56 }}
          allowFontScaling={false}
          accessible={false}>
          {icon}
        </Text>
      ) : letter ? (
        <Text
          style={{
            fontFamily: FontFamily.sansHeavy,
            fontSize: size * 0.46,
            lineHeight: size * 0.56,
            color,
          }}
          allowFontScaling={false}
          accessible={false}>
          {letter}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
});
