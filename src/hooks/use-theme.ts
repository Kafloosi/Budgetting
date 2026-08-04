import { Appearance, type SchemeName, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearancePreference } from '@/providers/settings';

export interface ActiveTheme extends Theme {
  scheme: SchemeName;
  isDark: boolean;
}

/**
 * The diagram fired for the light it is being read in: midnight enamel by
 * default, porcelain tile in daylight, or whichever the user pinned in
 * Settings.
 */
export function useTheme(): ActiveTheme {
  const colorScheme = useColorScheme();
  const preference = useAppearancePreference();

  const scheme: SchemeName =
    preference === 'system' ? (colorScheme === 'light' ? 'porcelain' : 'enamel') : preference;

  return { ...Appearance[scheme], scheme, isDark: scheme === 'enamel' };
}
