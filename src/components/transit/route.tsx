import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Defs, Line as SvgLine, Pattern, Rect, Svg } from 'react-native-svg';

import { Line, Motion, Radius, Stroke } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { BudgetStatus } from '@/db/repositories/budgets';

/**
 * A budget drawn as a length of route.
 *
 * The limit is the terminus bar. Spending is the distance travelled from the
 * origin bullet. The terminus always sits at the same fraction of the track so
 * two routes can be compared at a glance, and the strip beyond it is the
 * run-out: an over-budget route carries on into it, hatched, the way a diagram
 * marks a disrupted section.
 */

/** Where the end-of-line bar sits along the track. The rest is run-out. */
const TERMINUS_AT = 0.86;

const easing = Easing.bezier(...Motion.ease);

export function RouteLine({
  color,
  ratio,
  status,
  weight = Stroke.route,
  animate = true,
}: {
  color: string;
  /** spent / limit. May exceed 1. */
  ratio: number;
  status: BudgetStatus;
  weight?: number;
  animate?: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [track, setTrack] = useState(0);
  // Pattern ids share a document on web, so each route needs its own.
  const hatchId = `runout-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const terminusX = track * TERMINUS_AT;
  const runOut = track - terminusX;
  const travelled =
    ratio <= 1
      ? terminusX * Math.max(0, ratio)
      : terminusX + Math.min(runOut, runOut * Math.min(1, ratio - 1));

  const progress = useSharedValue(0);
  useEffect(() => {
    if (!track) return;
    if (!animate || reduceMotion) {
      progress.value = travelled;
      return;
    }
    progress.value = withTiming(travelled, { duration: Motion.travel, easing });
  }, [travelled, track, animate, reduceMotion, progress]);

  const travelStyle = useAnimatedStyle(() => ({ width: progress.value }));
  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value - weight * 0.9 }],
  }));

  const overshoot = status === 'over';
  const warnAt = terminusX * 0.8;

  return (
    <View
      style={[styles.track, { height: weight * 2.2 }]}
      onLayout={(event: LayoutChangeEvent) => setTrack(event.nativeEvent.layout.width)}>
      {/* Bed — the part of the route not yet travelled. */}
      <View
        style={[
          styles.bed,
          { height: weight, borderRadius: weight / 2, backgroundColor: theme.rule, width: terminusX },
        ]}
      />

      {/* Run-out, hatched, sitting past the terminus. */}
      {track > 0 ? (
        <View style={[styles.runOut, { left: terminusX, width: runOut, height: weight }]}>
          <Svg width="100%" height={weight}>
            <Defs>
              <Pattern
                id={hatchId}
                patternUnits="userSpaceOnUse"
                width={6}
                height={weight}
                patternTransform="rotate(0)">
                <SvgLine
                  x1={0}
                  y1={weight}
                  x2={6}
                  y2={0}
                  stroke={overshoot ? Line.scarlet : theme.rule}
                  strokeWidth={2}
                />
              </Pattern>
            </Defs>
            <Rect
              x={0}
              y={0}
              width="100%"
              height={weight}
              fill={`url(#${hatchId})`}
              opacity={overshoot ? 1 : 0.5}
            />
          </Svg>
        </View>
      ) : null}

      {/* Travelled — the money already spent. */}
      <Animated.View
        style={[
          styles.travelled,
          travelStyle,
          { height: weight, borderRadius: weight / 2, backgroundColor: overshoot ? Line.scarlet : color },
        ]}
      />

      {/* The 80% tick — the point a diagram would post a delay notice. */}
      {track > 0 ? (
        <View
          style={[
            styles.tick,
            {
              left: warnAt,
              height: weight * 2.2,
              backgroundColor: status === 'under' ? theme.ground : theme.ink,
              opacity: status === 'under' ? 0.9 : 1,
            },
          ]}
        />
      ) : null}

      {/* End of line. */}
      {track > 0 ? (
        <View
          style={[
            styles.terminus,
            { left: terminusX - Stroke.tick, height: weight * 2.2, backgroundColor: theme.ink },
          ]}
        />
      ) : null}

      {/* The train. */}
      {track > 0 ? (
        <Animated.View
          style={[
            styles.marker,
            markerStyle,
            {
              width: weight * 1.8,
              height: weight * 1.8,
              borderRadius: weight,
              borderColor: overshoot ? Line.scarlet : color,
              backgroundColor: theme.ground,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/**
 * A short length of route used as a rule between sections — the diagram's
 * answer to a horizontal divider.
 */
export function RouteRule({ color, width = 32 }: { color: string; width?: number }) {
  return (
    <View style={[styles.rule, { width, backgroundColor: color }]} />
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    width: '100%',
  },
  bed: {
    position: 'absolute',
    left: 0,
  },
  runOut: {
    position: 'absolute',
    overflow: 'hidden',
  },
  travelled: {
    position: 'absolute',
    left: 0,
  },
  tick: {
    position: 'absolute',
    width: Stroke.tick,
  },
  terminus: {
    position: 'absolute',
    width: Stroke.tick * 2,
    borderRadius: 1,
  },
  marker: {
    position: 'absolute',
    left: 0,
    borderWidth: Stroke.tick,
  },
  rule: {
    height: Stroke.tick * 2,
    borderRadius: Radius.full,
  },
});
