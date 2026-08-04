/*
 * ── FARE · DIRECTION CONTRACT ────────────────────────────────────────────────
 * (React Native emits no document, so the contract lives at the head of the
 * root layout — the file every edit re-opens.)
 *
 * THESIS: A month of money is a network you are travelling, not a pie you are
 *   slicing. Fare refuses the budgeting-app arrangement — big balance numeral,
 *   pastel category donut, soft rounded cards.
 * OWN-WORLD: A metropolitan rail diagram fired as enamel. Midnight enamel
 *   ground (#0A1330) or porcelain tile in light; six fixed route colours;
 *   Overpass, a Highway Gothic derivative, with all-caps tracked station
 *   labels and mono numerals; components built from route lines, station
 *   bullets, interchange rings and end-of-line bars.
 * STORY: The visitor sees where this month's spending has reached on each
 *   route, believes the answer to "can I afford this?" is one glance away, and
 *   logs the next purchase from the interchange on the trunk line.
 * FIRST VIEWPORT: Month name on a stepper, the month's net in mono display
 *   over a scarlet header rule, then budgeted categories as lengths of route —
 *   travelled in the category's colour, terminus bar at the limit, hatched
 *   run-out beyond it. The entry action is the raised scarlet interchange in
 *   the tab bar.
 * FORM: Midnight Transit Diagram — challenger taken over the assigned Giro
 *   Form on the user's call. Seed key 75c72dc4.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FontAssets, Line, Type } from '@/constants/theme';
import { migrateDatabase } from '@/db/migrations';
import { useTheme } from '@/hooks/use-theme';
import { AppLockGate } from '@/providers/app-lock';
import { CatchUpProvider } from '@/providers/catch-up';
import { LedgerProvider } from '@/providers/ledger';
import { SettingsProvider } from '@/providers/settings';
import { UndoProvider } from '@/providers/undo';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FontAssets);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Every label in the app is set in Overpass. Rendering the tree in the
  // system face first and swapping would reflow the whole diagram.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Suspense fallback={<Booting />}>
          <SQLiteProvider databaseName="budget.db" onInit={migrateDatabase} useSuspense>
            <SettingsProvider>
              <LedgerProvider>
                <CatchUpProvider>
                  <AppLockGate>
                    <UndoProvider>
                      <Navigation />
                    </UndoProvider>
                  </AppLockGate>
                </CatchUpProvider>
              </LedgerProvider>
            </SettingsProvider>
          </SQLiteProvider>
        </Suspense>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigation() {
  const theme = useTheme();

  const navigationTheme = {
    ...(theme.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.isDark ? DarkTheme : DefaultTheme).colors,
      primary: Line.scarlet,
      background: theme.ground,
      card: theme.raised,
      text: theme.ink,
      border: theme.rule,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.ground },
          // Named for the sheet's own dismissal, so swipe-down reads as
          // leaving the platform rather than losing work.
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="entry"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="category"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="budget"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="goal"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="recurring-rule"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="categories" />
        <Stack.Screen name="import" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="recurring" />
        <Stack.Screen name="trash" />
        <Stack.Screen name="backup" />
      </Stack>
    </ThemeProvider>
  );
}

/** Shown only while SQLite opens and migrates — normally a single frame. */
function Booting() {
  const theme = useTheme();
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.ground }}
      accessibilityRole="progressbar"
      accessibilityLabel="Opening your ledger">
      <ActivityIndicator color={Line.scarlet} size="large" />
      <View style={{ height: Type.body.lineHeight }} />
    </View>
  );
}
