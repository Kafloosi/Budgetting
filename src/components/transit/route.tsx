import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Defs, Line as SvgLine, Path, Pattern, Rect, Svg } from 'react-native-svg';

import { Line, Motion, Radius, Stroke } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import type { BudgetStatus } from '@/db/repositories/budgets';

/**
 * A budget drawn as a length of route.
 *
 * The limit is the terminus bar. Spending is the distance travelled from the
 * origin, which the line reaches by climbing out of the row on the diagram's
 * own 45° bend. Minor stations tick along the bed, the marker is a double-ring
 * interchange, and the terminus always sits at the same fraction of the track
 * so two routes can be compared at a glance. The strip beyond it is the
 * run-out: an over-budget route carries on into it, hatched, the way a diagram
 * marks a disrupted section.
 */

/** Where the end-of-line bar sits along the track. The rest is run-out. */
const TERMINUS_AT = 0.86;

/** Width of the 45° climb out of the origin. */
const BEND = 10;

/** Minor stations between origin and terminus. */
const MINOR_STATIONS = 3;

const easing = Easing.bezier(...Motion.ease);

export type RouteVariant =
  /** Spend against a limit: terminus bar and hatched run-out. */
  | 'budget'
  /** A share of a whole: the track is the whole, no run-out. */
  | 'share';

export function RouteLine({
  color,
  ratio,
  status,
  weight = Stroke.route,
  animate = true,
  variant = 'budget',
}: {
  color: string;
  /** spent / limit, or the share of the whole. May exceed 1 for budgets. */
  ratio: number;
  status: BudgetStatus;
  weight?: number;
  animate?: boolean;
  variant?: RouteVariant;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [track, setTrack] = useState(0);
  // Pattern ids share a document on web, so each route needs its own.
  const hatchId = `runout-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const isBudget = variant === 'budget';
  const terminusX = isBudget ? track * TERMINUS_AT : track;
  const runOut = track - terminusX;
  const clamped = Math.max(0, ratio);
  const travelled = isBudget
    ? clamped <= 1
      ? terminusX * clamped
      : terminusX + Math.min(runOut, runOut * Math.min(1, clamped - 1))
    : terminusX * Math.min(1, clamped);

  const height = weight * 2.6;
  const midY = height / 2;

  const progress = useSharedValue(0);
  useEffect(() => {
    if (!track) return;
    if (!animate || reduceMotion) {
      progress.value = travelled;
      return;
    }
    progress.value = withTiming(travelled, { duration: Motion.travel, easing });
  }, [travelled, track, animate, reduceMotion, progress]);

  const travelStyle = useAnimatedStyle(() => ({
    width: Math.max(0, progress.value - BEND),
  }));
  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(BEND, progress.value) - weight * 1.2 }],
  }));

  const overshoot = status === 'over';
  const warnAt = terminusX * 0.8;
  const travelledColor = overshoot ? Line.scarlet : color;

  return (
    <View
      style={[styles.track, { height }]}
      onLayout={(event: LayoutChangeEvent) => setTrack(event.nativeEvent.layout.width)}>
      {track > 0 ? (
        <Svg width="100%" height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern
              id={hatchId}
              patternUnits="userSpaceOnUse"
              width={6}
              height={height}>
              <SvgLine
                x1={0}
                y1={height}
                x2={6}
                y2={0}
                stroke={overshoot ? Line.scarlet : theme.rule}
                strokeWidth={2}
              />
            </Pattern>
          </Defs>

          {/* The bed: a 45° climb out of the row, then a level run to the end. */}
          <Path
            d={`M0 ${height - 1} L${BEND} ${midY} L${terminusX} ${midY}`}
            stroke={theme.rule}
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Minor stations — the intermediate stops a diagram always marks. */}
          {isBudget
            ? Array.from({ length: MINOR_STATIONS }).map((_, index) => {
                const at = BEND + ((terminusX - BEND) * (index + 1)) / (MINOR_STATIONS + 1);
                return (
                  <SvgLine
                    key={index}
                    x1={at}
                    y1={midY - weight * 0.85}
                    x2={at}
                    y2={midY + weight * 0.85}
                    stroke={theme.ink}
                    strokeWidth={Stroke.tick}
                    opacity={0.55}
                  />
                );
              })
            : null}

          {isBudget ? (
            <>
              <Rect
                x={terminusX}
                y={midY - weight / 2}
                width={runOut}
                height={weight}
                fill={`url(#${hatchId})`}
                opacity={overshoot ? 1 : 0.45}
              />
              {/* The 80% notice, and the end of the line. */}
              <SvgLine
                x1={warnAt}
                y1={midY - weight}
                x2={warnAt}
                y2={midY + weight}
                stroke={theme.ink}
                strokeWidth={Stroke.tick}
                opacity={status === 'under' ? 0.55 : 1}
              />
              <Rect
                x={terminusX - Stroke.tick}
                y={midY - weight * 1.15}
                width={Stroke.tick * 2}
                height={weight * 2.3}
                rx={1}
                fill={theme.ink}
              />
            </>
          ) : null}
        </Svg>
      ) : null}

      {/* Travelled — the money already spent, over the same bend. */}
      {track > 0 ? (
        <>
          <View style={[styles.bendTravelled, { width: BEND, height }]}>
            <Svg width={BEND} height={height}>
              <Path
                d={`M0 ${height - 1} L${BEND} ${midY}`}
                stroke={travelledColor}
                strokeWidth={weight}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </View>
          <Animated.View
            style={[
              styles.travelled,
              travelStyle,
              { left: BEND, height: weight, backgroundColor: travelledColor },
            ]}
          />
        </>
      ) : null}

      {/* The train, drawn as an interchange. */}
      {track > 0 ? (
        <Animated.View
          style={[
            styles.marker,
            markerStyle,
            {
              width: weight * 2.4,
              height: weight * 2.4,
              borderRadius: weight * 1.2,
              borderColor: travelledColor,
              // Porcelain, like every station bullet on a fired diagram.
              backgroundColor: theme.ink,
            },
          ]}>
          <View
            style={[
              styles.markerCore,
              { backgroundColor: travelledColor, width: weight * 0.7, height: weight * 0.7 },
            ]}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A short length of route used as a rule between sections — the diagram's
 * answer to a horizontal divider.
 */
export function RouteRule({ color, width = 32 }: { color: string; width?: number }) {
  return <View style={[styles.rule, { width, backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    width: '100%',
  },
  bendTravelled: {
    position: 'absolute',
    left: 0,
  },
  travelled: {
    position: 'absolute',
  },
  marker: {
    position: 'absolute',
    left: 0,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCore: {
    borderRadius: Radius.full,
  },
  rule: {
    height: Stroke.tick * 2,
    borderRadius: Radius.full,
  },
});
