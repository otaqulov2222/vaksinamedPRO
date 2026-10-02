import { Alert, Platform } from 'react-native';
import { tr } from '@/lib/i18n';

/**
 * Cross-platform dialogs. React Native Web implements Alert.alert as a no-op,
 * so web (including the Telegram Mini App) must use Telegram/browser dialogs.
 */

type TelegramWebApp = {
  initData?: string;
  isVersionAtLeast?: (version: string) => boolean;
  showAlert?: (message: string, callback?: () => void) => void;
  showConfirm?: (message: string, callback?: (ok: boolean) => void) => void;
};

function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  if (!app?.initData) return null;
  if (typeof app.isVersionAtLeast === 'function' && !app.isVersionAtLeast('6.2')) return null;
  return app;
}

function joinText(title: string, message?: string) {
  return message ? `${title}\n\n${message}` : title;
}

export function notify(title: string, message?: string): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message);
    return;
  }
  const tg = telegramWebApp();
  if (tg?.showAlert) {
    try {
      tg.showAlert(joinText(title, message));
      return;
    } catch {
      // fall through to the browser dialog
    }
  }
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(joinText(title, message));
  }
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export function confirmAction({ title, message, confirmText, cancelText, destructive }: ConfirmOptions): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: cancelText ?? tr('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          {
            text: confirmText ?? tr('common.confirm'),
            style: destructive ? 'destructive' : 'default',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }
  const tg = telegramWebApp();
  if (tg?.showConfirm) {
    try {
      return new Promise((resolve) => tg.showConfirm!(joinText(title, message), (ok) => resolve(Boolean(ok))));
    } catch {
      // fall through to the browser dialog
    }
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(joinText(title, message)));
  }
  return Promise.resolve(false);
}
