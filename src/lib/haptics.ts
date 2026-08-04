import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Touch feedback for the two moments that deserve it: money logged, and money
 * removed. Deliberately not on every tap — a keypad that buzzes twelve times
 * per entry is a keypad people turn off.
 */
export const haptics = {
  saved() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  removed() {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  warned() {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
};
