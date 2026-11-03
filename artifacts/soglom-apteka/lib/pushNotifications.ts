import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';

export const DEVICE_PUSH_TOKEN_KEY = 'vaksinamed_device_push_token';
export const NOTIF_UNREAD_COUNT_KEY = 'vaksinamed_notif_unread_count';

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function isNotificationSupported(): boolean {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && Boolean((window as any).Notification);
  }
  // Native: expo-notifications path
  return true;
}

export function getNotificationPermission(): PushPermissionState {
  if (Platform.OS === 'web') {
    if (!isNotificationSupported()) return 'unsupported';
    return (window.Notification.permission || 'default') as PushPermissionState;
  }
  return 'default';
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearStoredPushToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_PUSH_TOKEN_KEY);
  } catch {
    // best effort
  }
}

export async function getOrGenerateDeviceToken(): Promise<string> {
  try {
    let token = await AsyncStorage.getItem(DEVICE_PUSH_TOKEN_KEY);
    if (!token) {
      const randomPart = Math.random().toString(36).substring(2, 15);
      const timePart = Date.now().toString(36);
      token = `web_${Platform.OS}_${timePart}_${randomPart}`;
      await AsyncStorage.setItem(DEVICE_PUSH_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return `fallback_dev_${Date.now()}`;
  }
}

async function registerNativeExpoPush(): Promise<{
  granted: boolean;
  status: PushPermissionState;
}> {
  try {
    const Notifications = await import('expo-notifications');
    const Constants = (await import('expo-constants')).default;

    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;
    if (finalStatus !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      finalStatus = asked.status;
    }
    if (finalStatus !== 'granted') {
      return { granted: false, status: finalStatus === 'denied' ? 'denied' : 'default' };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const push = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined,
    );
    const token = push.data;
    await AsyncStorage.setItem(DEVICE_PUSH_TOKEN_KEY, token);
    await api.registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
    return { granted: true, status: 'granted' };
  } catch {
    return { granted: false, status: 'unsupported' };
  }
}

export async function requestPushPermissionAndRegister(): Promise<{
  granted: boolean;
  status: PushPermissionState;
}> {
  if (Platform.OS !== 'web') {
    return registerNativeExpoPush();
  }

  if (!isNotificationSupported()) {
    return { granted: false, status: 'unsupported' };
  }

  try {
    const permission = await window.Notification.requestPermission();
    const status = permission as PushPermissionState;

    if (permission === 'granted') {
      const token = await getOrGenerateDeviceToken();
      await api.registerPushToken({
        token,
        platform: 'web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      return { granted: true, status };
    }

    return { granted: false, status };
  } catch {
    return { granted: false, status: getNotificationPermission() };
  }
}

/** Best-effort: deactivate current device token on server and clear local storage. */
export async function unregisterCurrentPushToken(): Promise<void> {
  const token = await getStoredPushToken();
  if (!token) return;
  try {
    await api.unregisterPushToken(token);
  } catch {
    // offline / already deleted
  }
  await clearStoredPushToken();
}

export function showLocalPushNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): boolean {
  if (Platform.OS === 'web') {
    if (!isNotificationSupported() || window.Notification.permission !== 'granted') {
      return false;
    }
    try {
      new window.Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: (data?.type as string) || 'vaksinamed',
        data,
      });
      return true;
    } catch {
      return false;
    }
  }

  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data: data || {} },
        trigger: null,
      });
    } catch {
      // ignore
    }
  })();
  return true;
}

export async function setCachedUnreadCount(count: number): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_UNREAD_COUNT_KEY, String(Math.max(0, Math.floor(count))));
  } catch {
    // ignore
  }
}

export async function getCachedUnreadCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_UNREAD_COUNT_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
