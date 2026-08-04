import { StyleSheet, View } from 'react-native';
import { Circle, Line as SvgLine, Svg } from 'react-native-svg';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { Space, Stroke } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Nothing here yet, drawn as a route that has not been built: an open bullet at
 * the origin and a surveyed line running off into nothing. No invented
 * balances, no sample transactions — empty is empty.
 */
export function EmptyState({
  title,
  body,
  action,
  accent,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  accent: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Svg width={160} height={24} viewBox="0 0 160 24">
        <Circle
          cx={10}
          cy={12}
          r={7}
          stroke={accent}
          strokeWidth={Stroke.tick}
          fill="none"
        />
        <SvgLine
          x1={22}
          y1={12}
          x2={158}
          y2={12}
          stroke={theme.inkFaint}
          strokeWidth={Stroke.tick}
          strokeDasharray="2 10"
          strokeLinecap="round"
        />
      </Svg>

      <View style={styles.copy}>
        <Text variant="station">{title}</Text>
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
      </View>

      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxl,
  },
  copy: {
    alignItems: 'center',
    gap: Space.sm,
  },
  body: {
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    minWidth: 220,
  },
});
