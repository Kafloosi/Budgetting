import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Circle, G, Path, Svg } from 'react-native-svg';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { IconTick } from '@/components/transit/icons';
import { Wordmark } from '@/components/transit/roundel';
import { Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import { CURRENCIES } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/providers/settings';

/**
 * First run.
 *
 * One decision — which currency the ledger is read in — and then the network
 * opens. There is no account to make, so there is nothing else to ask, and no
 * screen explaining what the app does not do.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, update } = useSettings();
  const [choice, setChoice] = useState(
    () =>
      CURRENCIES.find(
        (option) => option.code === settings.currency && option.locale === settings.locale,
      ) ?? CURRENCIES[0],
  );

  async function start() {
    await update({ currency: choice.code, locale: choice.locale, onboarded: true });
    router.replace('/');
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.masthead}>
          <Wordmark size={34} />
        </View>

        <NetworkDiagram />

        <View style={styles.pitch}>
          <Text variant="title">A month of money, drawn as a network.</Text>
          <Text variant="body" tone="muted">
            Every category is a line. Its limit is the end of the line. You can see how far along
            you are without doing the sums.
          </Text>
        </View>

        <View style={styles.picker}>
          <Text variant="station" tone="muted">
            Read amounts in
          </Text>
          <View style={[styles.list, { borderColor: theme.rule }]}>
            <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {CURRENCIES.map((option) => {
                const active = option === choice;
                return (
                  <Pressable
                    key={`${option.code}-${option.locale}`}
                    onPress={() => setChoice(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.option,
                      { backgroundColor: pressed ? theme.raised : 'transparent' },
                    ]}>
                    <View
                      style={[
                        styles.bullet,
                        {
                          borderColor: active ? Line.scarlet : theme.inkFaint,
                          backgroundColor: active ? Line.scarlet : 'transparent',
                        },
                      ]}>
                      {active ? <IconTick size={12} color="#FFFFFF" /> : null}
                    </View>
                    <Text variant="body" style={styles.optionLabel} numberOfLines={1}>
                      {option.label}
                    </Text>
                    <Text variant="amountSmall" tone="muted">
                      {formatMoney(123456, { locale: option.locale, currency: option.code })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <Text variant="caption" tone="muted">
            You can change this later in Settings.
          </Text>
        </View>

        <Button label="Open the network" onPress={start} />
      </ScrollView>
    </Screen>
  );
}

/**
 * The mark, at full scale: four lines meeting at one interchange. Abstract on
 * purpose — there is no data yet, and inventing some to fill a hero would be a
 * lie about somebody's money.
 */
function NetworkDiagram() {
  const theme = useTheme();
  return (
    <View style={styles.diagram}>
      <Svg width="100%" height={180} viewBox="0 0 320 180" fill="none">
        <G strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M10 40 L80 40 L140 100 L310 100" stroke={Line.scarlet} />
          <Path d="M10 140 L100 140 L140 100 L200 100 L250 50 L310 50" stroke={Line.cobalt} />
          <Path d="M60 170 L60 120 L140 40 L310 40" stroke={Line.amber} />
          <Path d="M10 90 L60 90 L110 140 L240 140 L280 170" stroke={Line.green} />
        </G>
        <G>
          <Circle cx={140} cy={100} r={12} fill={theme.ground} stroke={theme.ink} strokeWidth={5} />
          <Circle cx={60} cy={140} r={7} fill={theme.ground} stroke={theme.ink} strokeWidth={4} />
          <Circle cx={250} cy={50} r={7} fill={theme.ground} stroke={theme.ink} strokeWidth={4} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.xl,
    paddingBottom: Space.xxl,
    gap: Space.xl,
  },
  masthead: {
    paddingTop: Space.md,
  },
  diagram: {
    marginHorizontal: -Space.xl,
  },
  pitch: {
    gap: Space.md,
  },
  picker: {
    gap: Space.sm,
  },
  list: {
    borderRadius: Radius.panel,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
  },
  listScroll: {
    maxHeight: 260,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: TouchTarget,
    paddingHorizontal: Space.lg,
  },
  bullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: Stroke.tick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
  },
});
