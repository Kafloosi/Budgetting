import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { Type, type TypeStyle } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Tone = 'ink' | 'muted' | 'faint';

export interface TextProps extends RNTextProps {
  variant?: TypeStyle;
  tone?: Tone;
  /** A route colour, for lettering that belongs to a specific line. */
  color?: string;
}

/**
 * Display and title sizes stop scaling before they break the diagram; body and
 * label text scales without limit, because that is the text people actually
 * need bigger.
 */
const MAX_SCALE: Partial<Record<TypeStyle, number>> = {
  display: 1.35,
  title: 1.5,
  station: 1.6,
};

export function Text({ variant = 'body', tone = 'ink', color, style, ...rest }: TextProps) {
  const theme = useTheme();
  const toneColor = tone === 'muted' ? theme.inkMuted : tone === 'faint' ? theme.inkFaint : theme.ink;

  return (
    <RNText
      maxFontSizeMultiplier={MAX_SCALE[variant]}
      style={[Type[variant] as TextStyle, { color: color ?? toneColor }, style]}
      {...rest}
    />
  );
}
