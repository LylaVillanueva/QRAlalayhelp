import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'resqr.notificationPrefs';

// The only notification preference: whether this device is registered for push.
export const DEFAULT_NOTIFICATION_PREFS = {
  pushEnabled: true,
};

export async function loadNotificationPrefs() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_NOTIFICATION_PREFS };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(prefs) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Non-fatal — the toggle still reflects the in-memory value this session.
  }
}
