import { Circle, G, Line, Path, Rect, Svg } from 'react-native-svg';

/**
 * The icon set, drawn rather than borrowed.
 *
 * Every glyph is built from the diagram's own parts — route lines that turn at
 * 45°, station ticks, bullets, interchange rings and the end-of-line bar — on a
 * 24pt grid at a constant 2pt stroke with round caps. Nothing here is a generic
 * UI symbol wearing transit colours.
 */

export interface IconProps {
  /** Defaults to 24. Line weight scales with it so glyphs stay in one family. */
  size?: number;
  color: string;
  /** Fills bullets and rings — used for the focused tab. */
  filled?: boolean;
}

function Frame({ size = 24, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

const STROKE = 2;

/** Month — the interchange where every route is read at once. */
export function IconInterchange({ size, color, filled }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round">
        <Line x1={2} y1={12} x2={6} y2={12} />
        <Line x1={18} y1={12} x2={22} y2={12} />
        <Line x1={12} y1={2} x2={12} y2={6} />
        <Line x1={12} y1={18} x2={12} y2={22} />
      </G>
      <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={STROKE} fill="none" />
      <Circle cx={12} cy={12} r={2.5} fill={filled ? color : 'none'} stroke={color} strokeWidth={STROKE} />
    </Frame>
  );
}

/** Ledger — the running order of stations on a line. */
export function IconLedger({ size, color, filled }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round">
        <Line x1={4} y1={4} x2={4} y2={20} />
        <Line x1={10} y1={6} x2={20} y2={6} />
        <Line x1={10} y1={12} x2={20} y2={12} />
        <Line x1={10} y1={18} x2={17} y2={18} />
      </G>
      <G fill={filled ? color : 'none'} stroke={color} strokeWidth={STROKE}>
        <Circle cx={4} cy={6} r={1.8} />
        <Circle cx={4} cy={12} r={1.8} />
        <Circle cx={4} cy={18} r={1.8} />
      </G>
    </Frame>
  );
}

/** Budgets — a route running into its end-of-line bar. */
export function IconTerminus({ size, color, filled }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M2 18 L8 18 L13 13 L18 13" />
        <Line x1={18} y1={7} x2={18} y2={19} />
        <Line x1={2} y1={7} x2={13} y2={7} />
      </G>
      {filled ? <Rect x={16.6} y={7} width={2.8} height={12} rx={1.4} fill={color} /> : null}
    </Frame>
  );
}

/** Settings — a set of points, where the line is switched onto another route. */
export function IconPoints({ size, color, filled }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M2 12 L9 12 L14 7 L22 7" />
        <Path d="M14 17 L22 17" />
        <Path d="M9 12 L14 17" />
      </G>
      <Circle cx={9} cy={12} r={2.2} fill={filled ? color : 'none'} stroke={color} strokeWidth={STROKE} />
    </Frame>
  );
}

/** The entry action — two routes crossing at a new interchange. */
export function IconAdd({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={2.6} strokeLinecap="round">
        <Line x1={12} y1={4} x2={12} y2={20} />
        <Line x1={4} y1={12} x2={20} y2={12} />
      </G>
    </Frame>
  );
}

/** The signage arrow — a route line that turns and ends in a head. */
export function IconArrow({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={3} y1={12} x2={19} y2={12} />
        <Path d="M14 7 L19 12 L14 17" />
      </G>
    </Frame>
  );
}

export function IconBack({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={21} y1={12} x2={5} y2={12} />
        <Path d="M10 7 L5 12 L10 17" />
      </G>
    </Frame>
  );
}

export function IconChevronDown({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M6 9 L12 15 L18 9"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Frame>
  );
}

export function IconSearch({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Line
        x1={16}
        y1={16}
        x2={21}
        y2={21}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Frame>
  );
}

export function IconClose({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round">
        <Line x1={6} y1={6} x2={18} y2={18} />
        <Line x1={18} y1={6} x2={6} y2={18} />
      </G>
    </Frame>
  );
}

export function IconTick({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <Path
        d="M4 12.5 L9.5 18 L20 7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Frame>
  );
}

/** Over budget — the service-disruption diagonal. */
export function IconDisruption({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} fill="none" />
      <Line
        x1={7}
        y1={17}
        x2={17}
        y2={7}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Frame>
  );
}

/** Import — an outside line joining the network. */
export function IconImport({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 5 L9 5 L14 10 L14 19" />
        <Path d="M10 15 L14 19 L18 15" />
        <Line x1={19} y1={5} x2={21} y2={5} />
      </G>
    </Frame>
  );
}

/** Stats — months read against a datum line. */
export function IconChart({ size, color, filled }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round">
        <Line x1={2} y1={12} x2={22} y2={12} />
      </G>
      <G fill={filled ? color : 'none'} stroke={color} strokeWidth={STROKE}>
        <Rect x={4} y={5} width={4} height={7} rx={1} />
        <Rect x={10} y={12} width={4} height={7} rx={1} />
        <Rect x={16} y={8} width={4} height={4} rx={1} />
      </G>
    </Frame>
  );
}

/** A goal — a line still being surveyed, running toward an open terminus. */
export function IconGoal({ size, color, filled }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round">
        <Line x1={2} y1={17} x2={7} y2={17} />
        <Line x1={7} y1={17} x2={12} y2={12} strokeDasharray="1 4" />
        <Line x1={12} y1={12} x2={16} y2={8} strokeDasharray="1 4" />
      </G>
      <Circle cx={18} cy={6} r={3.6} stroke={color} strokeWidth={STROKE} fill={filled ? color : 'none'} />
    </Frame>
  );
}

/** Backup — the network copied onto a second plate. */
export function IconBackup({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={3} y={3} width={12} height={12} rx={2} />
        <Path d="M9 21 L21 21 L21 9" />
        <Line x1={6.5} y1={9} x2={11.5} y2={9} />
      </G>
    </Frame>
  );
}

/** Backspace — reversing one stop back up the line. */
export function IconBackspace({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={20} y1={12} x2={7} y2={12} />
        <Path d="M12 7 L7 12 L12 17" />
        <Line x1={3} y1={6} x2={3} y2={18} />
      </G>
    </Frame>
  );
}

export function IconTrash({ size, color }: IconProps) {
  return (
    <Frame size={size}>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={4} y1={7} x2={20} y2={7} />
        <Path d="M6 7 L7 20 L17 20 L18 7" />
        <Path d="M9.5 7 L9.5 4.5 L14.5 4.5 L14.5 7" />
      </G>
    </Frame>
  );
}
