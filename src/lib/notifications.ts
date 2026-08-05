/**
 * Local notifications, and only local ones.
 *
 * Nothing about this reaches a server. There is no push token, no project id and
 * no account — a budget alert is the phone telling you what the phone already
 * knows, which is the only kind of notification a local-first app can honestly
 * send.
 *
 * Every call is a no-op on web, where the app also runs and where the module has
 * no business asking for anything.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Its own channel, so budget alerts can be silenced without silencing the app. */
export const BUDGET_CHANNEL = 'budget-alerts';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

// Banner and list, no sound and no badge. A budget alert is information, not an
// interruption — it should be waiting for you, not demand the phone's attention.
//
// Behind the platform guard because this runs on import, and the app is also
// served on web, where the module has nothing to register a handler with.
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Android needs the channel to exist before the permission prompt will appear,
 * so this runs before asking rather than at first send.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(BUDGET_CHANNEL, {
    name: 'Budget alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
    // Scarlet is the network's alert colour, and the only line colour with a job
    // outside its own category.
    lightColor: '#E7002A',
  });
}

/** Whether alerts can be sent right now, without prompting for anything. */
export async function canNotify(): Promise<boolean> {
  if (!supported) return false;
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/**
 * Asks, once, at the moment the user turns alerts on.
 *
 * Never at launch. A permission prompt before the app has shown what it is for
 * is the fastest way to a permanent no.
 */
export async function askToNotify(): Promise<boolean> {
  if (!supported) return false;
  await ensureChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Denied and not askable again: the OS will not show a second prompt, so say
  // so rather than pretending the toggle worked.
  if (!existing.canAskAgain) return false;

  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

/** Sends now. `trigger: null` is delivery on the spot rather than a schedule. */
export async function notify(title: string, body: string): Promise<void> {
  if (!supported) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger:
      Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: BUDGET_CHANNEL }
        : null,
  });
}
