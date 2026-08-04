import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen, ScreenHeader, SectionLabel } from '@/components/screen';
import { Text } from '@/components/text';
import {
  IconArrow,
  IconBackup,
  IconChart,
  IconGoal,
  IconImport,
  IconPoints,
  IconTerminus,
  IconTick,
  IconTrash,
} from '@/components/transit/icons';
import { Elevation, Line, Radius, Space, Stroke, TouchTarget } from '@/constants/theme';
import type { AppearancePreference } from '@/db/repositories/settings';
import { CURRENCIES, type CurrencyOption } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';
import { canUseAppLock } from '@/providers/app-lock';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/providers/settings';

const APPEARANCES: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'enamel', label: 'Dark' },
  { value: 'porcelain', label: 'Light' },
];

/**
 * Settings — the points, where the network is switched.
 *
 * There is no account to manage and nothing to sign in to, so this screen is
 * the currency, the shape of the network, and the ways data gets in and out.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, update } = useSettings();
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [lockAvailable, setLockAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    canUseAppLock().then((available) => {
      if (!cancelled) setLockAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const active =
    CURRENCIES.find(
      (option) => option.code === settings.currency && option.locale === settings.locale,
    ) ?? CURRENCIES.find((option) => option.code === settings.currency);

  return (
    <Screen>
      <ScreenHeader title="Settings" accent={Line.green} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionLabel>Money</SectionLabel>
          <Row
            label="Currency"
            value={active?.label ?? settings.currency}
            detail={formatMoney(123456, { locale: settings.locale, currency: settings.currency })}
            onPress={() => setPickingCurrency(true)}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Network</SectionLabel>
          <Row
            label="Categories"
            value="Lines, colours and icons"
            icon={<IconPoints size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/categories')}
          />
          <Row
            label="Timetable"
            value="Entries that repeat on their own"
            icon={<IconTerminus size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/recurring')}
          />
          <Row
            label="Savings goals"
            value="Targets and what you have set aside"
            icon={<IconGoal size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/goals')}
          />
          <Row
            label="Network stats"
            value="Six months, or a whole year"
            icon={<IconChart size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/stats')}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Appearance</SectionLabel>
          <View style={styles.plates} accessibilityRole="radiogroup">
            {APPEARANCES.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => update({ appearance: option.value })}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.appearance === option.value }}
                style={({ pressed }) => [
                  styles.plate,
                  {
                    borderColor: settings.appearance === option.value ? theme.ink : theme.rule,
                    backgroundColor: pressed ? theme.raised : 'transparent',
                  },
                ]}>
                <View
                  style={[
                    styles.plateBullet,
                    {
                      borderColor:
                        settings.appearance === option.value ? theme.ink : theme.inkFaint,
                      backgroundColor:
                        settings.appearance === option.value ? theme.ink : 'transparent',
                    },
                  ]}
                />
                <Text
                  variant="station"
                  tone={settings.appearance === option.value ? 'ink' : 'muted'}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>Data</SectionLabel>
          <Row
            label="Import a statement"
            value="Read a CSV from your bank"
            icon={<IconImport size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/import')}
          />
          <Row
            label="Backup"
            value="Export everything, or move to a new phone"
            icon={<IconBackup size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/backup')}
          />
          <Row
            label="Out of service"
            value="Deleted entries, still recoverable"
            icon={<IconTrash size={20} color={theme.inkMuted} />}
            onPress={() => router.push('/trash')}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Privacy</SectionLabel>
          <View style={styles.toggleRow}>
            <View style={styles.rowBody}>
              <Text variant="body">App lock</Text>
              <Text variant="caption" tone="muted">
                {lockAvailable
                  ? 'Ask for your fingerprint, face or passcode before opening.'
                  : 'This phone has no fingerprint, face or passcode set up.'}
              </Text>
            </View>
            <Switch
              value={settings.appLock}
              onValueChange={(value) => update({ appLock: value })}
              disabled={!lockAvailable}
              trackColor={{ true: Line.green, false: theme.rule }}
              thumbColor={theme.ink}
              accessibilityLabel="App lock"
            />
          </View>
        </View>

        <View style={styles.about}>
          <Text variant="station" tone="faint">
            {`Fare ${Constants.expoConfig?.version ?? ''}`}
          </Text>
        </View>
      </ScrollView>

      <CurrencyPicker visible={pickingCurrency} onClose={() => setPickingCurrency(false)} />
    </Screen>
  );
}

function Row({
  label,
  value,
  detail,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.raised : 'transparent' },
      ]}>
      {icon}
      <View style={styles.rowBody}>
        <Text variant="body">{label}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {value}
        </Text>
      </View>
      {detail ? (
        <Text variant="amountSmall" tone="faint">
          {detail}
        </Text>
      ) : null}
      <IconArrow size={18} color={theme.inkMuted} />
    </Pressable>
  );
}

function CurrencyPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const { settings, update } = useSettings();

  async function choose(option: CurrencyOption) {
    await update({ currency: option.code, locale: option.locale });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, Elevation, { backgroundColor: theme.raised, borderColor: theme.rule }]}
          onPress={() => {}}>
          <Text variant="station" tone="muted" style={styles.sheetTitle}>
            Currency
          </Text>
          <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
            {CURRENCIES.map((option) => {
              const active = option.code === settings.currency && option.locale === settings.locale;
              return (
                <Pressable
                  key={`${option.code}-${option.locale}`}
                  onPress={() => choose(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: pressed ? theme.ground : 'transparent' },
                  ]}>
                  <View
                    style={[
                      styles.optionBullet,
                      {
                        borderColor: active ? Line.green : theme.inkFaint,
                        backgroundColor: active ? Line.green : 'transparent',
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
          <Button label="Done" variant="quiet" showArrow={false} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Space.xl,
    paddingBottom: 140,
    gap: Space.xxl,
  },
  section: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 60,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    minHeight: 60,
  },
  plates: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  plate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    borderWidth: Stroke.tick,
  },
  plateBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: Stroke.tick,
  },
  about: {
    alignItems: 'center',
    paddingTop: Space.xl,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(3, 7, 20, 0.72)',
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: Stroke.hairline,
    padding: Space.lg,
    gap: Space.md,
    maxHeight: '82%',
  },
  sheetTitle: {
    textAlign: 'center',
  },
  sheetList: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: TouchTarget,
    paddingHorizontal: Space.md,
    borderRadius: Radius.plate,
  },
  optionBullet: {
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
