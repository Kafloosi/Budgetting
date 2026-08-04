/**
 * Fare — design tokens.
 *
 * The world is a metropolitan rail diagram fired as enamel. Two appearances,
 * both real enamel: `enamel` is the midnight-blue mural (dark), `porcelain` is
 * the same diagram fired on white station tile (light). Neither is an invert of
 * the other — the line colours are constant, the ground and ink swap.
 *
 * Categories are routes. A route's colour comes from `categories.color` in the
 * database, which migration 3 aligns to the six line colours below. Budget
 * status is never carried by hue alone: an over-budget route is drawn running
 * past its terminus, and always carries a written label.
 */

import { Platform } from 'react-native';

import '@/global.css';

/**
 * The six route colours. Every category resolves to one of these.
 * Fixed across both appearances — a diagram's lines do not change colour when
 * you take it out of the tunnel.
 */
export const Line = {
  scarlet: '#E7002A',
  cobalt: '#0057FF',
  amber: '#FFB800',
  green: '#009B4D',
  violet: '#8E4EC6',
  teal: '#00A3A3',
} as const;

export type LineColor = (typeof Line)[keyof typeof Line];

/** Ordered for the category colour picker and for assigning new routes. */
export const LineOrder: LineColor[] = [
  Line.scarlet,
  Line.cobalt,
  Line.amber,
  Line.green,
  Line.violet,
  Line.teal,
];

/** Text-safe variants of the line colours, for lettering rather than lines. */
export interface OnGround {
  scarlet: string;
  cobalt: string;
  amber: string;
  green: string;
  violet: string;
  teal: string;
}

/**
 * One shape for both appearances, so a component reads `theme.rule` without
 * caring which enamel it was fired on.
 */
export interface Theme {
  ground: string;
  raised: string;
  sunken: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  rule: string;
  focus: string;
  onGround: OnGround;
}

const enamel: Theme = {
  /** Midnight enamel — the mural ground. */
  ground: '#0A1330',
  /** One tonal step up: panels, sheets, the tab bar. */
  raised: '#101D45',
  /** Pressed and inset wells. */
  sunken: '#060C21',
  /** Porcelain lettering. */
  ink: '#FFFFFF',
  /** Tinted from the ground's hue, never grey. 7.0:1 on `ground`. */
  inkMuted: '#94A3C4',
  /** Hairlines, disabled glyphs, spent track. Decorative weight only. */
  inkFaint: '#4C5C87',
  /** Relief line ink — rules and route beds. */
  rule: '#1E2C57',
  /** Focus and selection ring. */
  focus: '#7FB0FF',
  /** Text-safe variants of line colours that fail contrast as lettering. */
  onGround: {
    scarlet: '#FF5A6E',
    cobalt: '#6FA5FF',
    amber: '#FFC53D',
    green: '#2ED47A',
    violet: '#C58AF9',
    teal: '#2EC8C8',
  },
};

const porcelain: Theme = {
  /** Fired station tile — cool, not cream. */
  ground: '#EDF0F6',
  raised: '#FFFFFF',
  sunken: '#DFE4EE',
  ink: '#0A1330',
  /** 6.1:1 on `ground`. */
  inkMuted: '#4A5878',
  inkFaint: '#9AA6C0',
  rule: '#CFD7E6',
  focus: '#0057FF',
  onGround: {
    scarlet: '#C40024',
    cobalt: '#0044CC',
    amber: '#8A6200',
    green: '#007A3D',
    violet: '#6E2FA8',
    teal: '#00706F',
  },
};

export const Appearance = { enamel, porcelain };

export type SchemeName = keyof typeof Appearance;

/**
 * Overpass: a Highway Gothic derivative, so the signage lineage is real rather
 * than borrowed. Android will not synthesise weights for a custom family, so
 * every weight is registered as its own family name.
 */
export const FontFamily = {
  sans: 'Overpass',
  sansSemi: 'Overpass-SemiBold',
  sansBold: 'Overpass-Bold',
  sansHeavy: 'Overpass-Heavy',
  /** Money and any other measured quantity. Digits must not shift width. */
  mono: 'OverpassMono',
  monoSemi: 'OverpassMono-SemiBold',
  monoBold: 'OverpassMono-Bold',
} as const;

/** The font files `useFonts` loads at startup, keyed by the names above. */
export const FontAssets = {
  [FontFamily.sans]: require('@/assets/fonts/Overpass-Regular.ttf'),
  [FontFamily.sansSemi]: require('@/assets/fonts/Overpass-SemiBold.ttf'),
  [FontFamily.sansBold]: require('@/assets/fonts/Overpass-Bold.ttf'),
  [FontFamily.sansHeavy]: require('@/assets/fonts/Overpass-Heavy.ttf'),
  [FontFamily.mono]: require('@/assets/fonts/OverpassMono-Regular.ttf'),
  [FontFamily.monoSemi]: require('@/assets/fonts/OverpassMono-SemiBold.ttf'),
  [FontFamily.monoBold]: require('@/assets/fonts/OverpassMono-Bold.ttf'),
};

/**
 * Sizes are unitless RN points and scale with the OS text-size setting by
 * default. Only the two display sizes cap their multiplier, because a 200%
 * month total would push the route diagram off screen.
 */
export const Type = {
  /** The month's net. One per screen at most. */
  display: {
    fontFamily: FontFamily.monoBold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1,
  },
  /** Screen titles. */
  title: {
    fontFamily: FontFamily.sansHeavy,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  /**
   * Station label — the diagram's own voice. All section headings, tab labels
   * and control labels are set in it.
   */
  station: {
    fontFamily: FontFamily.sansBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: FontFamily.sansSemi,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0,
  },
  label: {
    fontFamily: FontFamily.sansSemi,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  /** Amounts in rows and totals. */
  amount: {
    fontFamily: FontFamily.monoSemi,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  amountSmall: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
} as const;

export type TypeStyle = keyof typeof Type;

/** 4pt grid. The diagram is drawn on it and so is everything else. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  /** Station bullets and the roundel. */
  full: 999,
  /** Enamel plates — buttons, fields, sheets. */
  plate: 12,
  panel: 20,
  sheet: 28,
} as const;

/** Line weights, in points, taken from the diagram's own drawing. */
export const Stroke = {
  hairline: 1,
  tick: 2,
  /** A route line. */
  route: 6,
  /** A route line at hero scale. */
  trunk: 10,
} as const;

/** 48 clears both the iOS 44pt and the Android 48dp minimum. */
export const TouchTarget = 48;

export const Motion = {
  /** State flips: a bullet filling, a label swapping. */
  quick: 160,
  /** The default — a marker moving along its route. */
  travel: 420,
  /** The one orchestrated arrival on the Month screen. */
  arrival: 700,
  /** Exponential ease-out. Everything decelerates into its station. */
  ease: [0.16, 1, 0.3, 1] as const,
} as const;

/**
 * Enamel is glossy, so depth is a real offset shadow plus a tonal step — never
 * a zero-offset halo.
 */
export const Elevation = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  default: { elevation: 8 },
});

/** Tablets get a centred column; the diagram is not improved by being 1000pt wide. */
export const MaxContentWidth = 620;
