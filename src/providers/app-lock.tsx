import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/transit/roundel';
import { Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/providers/settings';

/** How long the app may sit in the background before it locks again. */
const GRACE_MS = 30_000;

/**
 * Optional lock in front of the ledger.
 *
 * The phone's own biometrics or passcode, never a password this app invents —
 * there is no account, so there is nothing to check a password against, and
 * storing one would be security theatre over a local SQLite file. Locking is
 * about the person who picks up your unlocked phone, and the OS already knows
 * how to answer that question.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { settings, loading } = useSettings();
  const [unlocked, setUnlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const authenticate = useCallback(async () => {
    setFailed(false);
    const success = await prompt();
    if (success) setUnlocked(true);
    else setFailed(true);
  }, []);

  // Web has no platform authenticator to defer to, so the lock is a native
  // feature rather than a false promise.
  const enforced = settings.appLock && Platform.OS !== 'web';

  // The OS authenticator is an external system: the effect starts it, and the
  // state lands in its callback rather than in the effect body.
  useEffect(() => {
    if (loading || !enforced || unlocked) return;
    let cancelled = false;
    prompt().then((success) => {
      if (cancelled) return;
      if (success) setUnlocked(true);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, enforced, unlocked]);

  useEffect(() => {
    if (!enforced) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active' || backgroundedAt.current === null) return;
      // A short trip to the camera roll should not demand a fingerprint.
      if (Date.now() - backgroundedAt.current > GRACE_MS) setUnlocked(false);
      backgroundedAt.current = null;
    });
    return () => subscription.remove();
  }, [enforced]);

  if (loading || !enforced || unlocked) return <>{children}</>;

  return (
    <View style={[styles.gate, { backgroundColor: theme.ground }]}>
      <Wordmark size={34} />
      <Text variant="body" tone="muted" style={styles.copy}>
        {failed
          ? 'Fare stays closed until the phone confirms it is you.'
          : 'Waiting for the phone to confirm it is you.'}
      </Text>
      {failed ? <Button label="Try again" onPress={authenticate} showArrow={false} /> : null}
    </View>
  );
}

/** Asks the OS to confirm the person holding the phone. */
async function prompt(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Fare',
    cancelLabel: 'Cancel',
    // Falling back to the device passcode keeps the app usable when a
    // fingerprint is wet or the face is in the dark.
    disableDeviceFallback: false,
  });
  return result.success;
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xl,
    padding: Space.xl,
  },
  copy: {
    textAlign: 'center',
    maxWidth: 320,
  },
});

/** Whether this device can actually do the lock, for the settings toggle. */
export async function canUseAppLock(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && enrolled;
}
