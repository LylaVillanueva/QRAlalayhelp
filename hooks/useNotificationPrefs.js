import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_NOTIFICATION_PREFS, loadNotificationPrefs, saveNotificationPrefs } from "../services/notificationPrefs";
import { registerDeviceForPush, unregisterDeviceForPush } from "../services/pushRegistration";
import { notificationPermissions, getExpoPushToken } from "../services/notifications";

// Backs every Settings screen's notification toggles with real, persisted
// state (they used to be a bare useState that reset the moment you left the
// screen). The master "push enabled" toggle also actually (de)registers
// this device with the backend, so turning it off really stops delivery.
export default function useNotificationPrefs() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  // Only offer the toggle when this device can obtain a push token, i.e. the
  // build has push credentials and notification permission was granted.
  const [pushAvailable, setPushAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (notificationPermissions.supported) getExpoPushToken().then((token) => { if (active) setPushAvailable(!!token); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadNotificationPrefs().then((loaded) => { if (active) setPrefs(loaded); });
    return () => { active = false; };
  }, []);

  const set = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      saveNotificationPrefs(next);
      return next;
    });
  }, []);

  const setPushEnabled = useCallback((value) => {
    set('pushEnabled', value);
    if (value) registerDeviceForPush(true);
    else unregisterDeviceForPush();
  }, [set]);

  // Hidden in Expo Go, on web, and when push credentials or permission are missing.
  return { prefs, set, setPushEnabled, pushSupported: pushAvailable };
}
