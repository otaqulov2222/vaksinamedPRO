import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';

const DEVICE_PUSH_TOKEN_KEY = 'vaksinamed_device_push_token';

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).Notification);
}

export function getNotificationPermission(): PushPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return (window.Notification.permission || 'default') as PushPermissionState;
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

export async function requestPushPermissionAndRegister(): Promise<{
  granted: boolean;
  status: PushPermissionState;
}> {
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
        platform: Platform.OS === 'web' ? 'web' : (Platform.OS as any),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      return { granted: true, status };
    }

    return { granted: false, status };
  } catch {
    return { granted: false, status: getNotificationPermission() };
  }
}

export function showLocalPushNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): boolean {
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
