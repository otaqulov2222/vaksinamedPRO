import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';

export const DEVICE_PUSH_TOKEN_KEY = 'vaksinamed_device_push_token';
export const NOTIF_UNREAD_COUNT_KEY = 'vaksinamed_notif_unread_count';

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function isNotificationSupported(): boolean {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return false;
    // Push/Notification API requires a secure context (HTTPS or localhost).
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) return false;
    return typeof (window as any).Notification === 'function';
  }
  // Native: expo-notifications path
  return true;
}

function isWebPushSubscribeSupported(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!isNotificationSupported()) return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof (window as any).PushManager === 'function'
  );
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSubscribeSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

async function subscribeWebPushAndRegister(): Promise<{
  granted: boolean;
  status: PushPermissionState;
}> {
  if (!isNotificationSupported()) {
    return { granted: false, status: 'unsupported' };
  }

  if (!isWebPushSubscribeSupported()) {
    // Notification API exists (e.g. some Safari) but PushManager/SW does not — be honest.
    return { granted: false, status: 'unsupported' };
  }

  try {
    const permission = await window.Notification.requestPermission();
    const status = permission as PushPermissionState;
    if (permission !== 'granted') {
      return { granted: false, status };
    }

    const vapid = await api.getVapidPublicKey();
    if (!vapid.configured || !vapid.publicKey) {
      return { granted: false, status: 'unsupported' };
    }

    const registration = await ensurePushServiceWorker();
    if (!registration) {
      return { granted: false, status: 'unsupported' };
    }

    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const endpoint = json.endpoint || subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { granted: false, status: 'unsupported' };
    }

    const token = `webpush:${endpoint}`;
    await AsyncStorage.setItem(DEVICE_PUSH_TOKEN_KEY, token);
    await api.registerPushToken({
      token,
      platform: 'web',
      endpoint,
      keys: { p256dh, auth },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    return { granted: true, status: 'granted' };
  } catch {
    return { granted: false, status: getNotificationPermission() === 'granted' ? 'unsupported' : getNotificationPermission() };
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
  return subscribeWebPushAndRegister();
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
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    } catch {
      // ignore
    }
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
