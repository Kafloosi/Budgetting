import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { MaxContentWidth, Space, Stroke } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The surfaces the diagram is fired on. Vitreous enamel is never a flat fill —
 * it carries a sprayed grain and a gloss where the light falls — so each
 * appearance gets a real rasterised surface rather than a hex value.
 * See `scripts/make-textures.mjs`.
 */
const SURFACE = {
  enamel: require('@/assets/images/enamel-surface.png'),
  porcelain: require('@/assets/images/porcelain-surface.png'),
};

/**
 * The enamel ground every screen is fired on, inside the safe area, with the
 * content held to a readable column on wide devices.
 */
export function Screen({
  children,
  edges = ['top', 'left', 'right'],
}: {
  children: ReactNode;
  edges?: readonly Edge[];
}) {
  const theme = useTheme();
  return (
    <View style={[styles.ground, { backgroundColor: theme.ground }]}>
      <Image
        source={SURFACE[theme.scheme]}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // Decoded once and reused across every screen.
        cachePolicy="memory-disk"
        transition={0}
      />
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.column}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

/**
 * A screen title over its own line — the way a station name sits above the
 * route it belongs to. The line is the screen's identity, so it takes the
 * colour of whatever the screen is about.
 */
export function ScreenHeader({
  title,
  subtitle,
  accent,
  trailing,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
      <View style={styles.headerLine}>
        <View
          style={[
            styles.headerBullet,
            { borderColor: accent, backgroundColor: theme.ground },
          ]}
        />
        <View style={[styles.headerRule, { backgroundColor: accent }]} />
      </View>
    </View>
  );
}

/** Section heading, set as a station label. */
export function SectionLabel({ children, style }: { children: string; style?: object }) {
  return (
    <Text variant="station" tone="muted" style={[styles.section, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  ground: {
    flex: 1,
  },
  safe: {
    flex: 1,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  header: {
    paddingTop: Space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingHorizontal: Space.xl,
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    marginTop: Space.xs,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.md,
  },
  headerBullet: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: Stroke.tick,
    marginLeft: Space.xl - 6,
  },
  headerRule: {
    flex: 1,
    height: Stroke.route,
  },
  section: {
    paddingHorizontal: Space.xl,
    marginBottom: Space.md,
  },
});
