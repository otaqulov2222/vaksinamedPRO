import { Alert, Platform } from 'react-native';
import { tr } from '@/lib/i18n';

/**
 * Cross-platform dialogs.
 * Prefer in-app AppDialogHost (toast + confirm sheet) so Electron/web never
 * falls back to native window.alert / window.confirm.
 * Telegram Mini App keeps its dialogs only when the host is not mounted.
 */

type TelegramWebApp = {
  initData?: string;
  isVersionAtLeast?: (version: string) => boolean;
  showAlert?: (message: string, callback?: () => void) => void;
  showConfirm?: (message: string, callback?: (ok: boolean) => void) => void;
};

export type AppNotifyTone = 'success' | 'error' | 'info';

export type AppNotifyRequest = {
  title: string;
  message?: string;
  tone: AppNotifyTone;
};

export type AppConfirmRequest = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

type AppDialogHostApi = {
  notify: (req: AppNotifyRequest) => void;
  confirm: (req: AppConfirmRequest) => void;
};

let dialogHost: AppDialogHostApi | null = null;

export function registerAppDialogHost(host: AppDialogHostApi): () => void {
  dialogHost = host;
  return () => {
    if (dialogHost === host) dialogHost = null;
  };
}

function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const app = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  if (!app?.initData) return null;
  if (typeof app.isVersionAtLeast === 'function' && !app.isVersionAtLeast('6.2')) return null;
  return app;
}

const LOG_LEVELS = new Set(['warning', 'error', 'success', 'info']);

function joinText(title: string, message?: string) {
  if (!message || LOG_LEVELS.has(message.toLowerCase().trim())) return title;
  return `${title}\n\n${message}`;
}

function inferTone(title: string, message?: string): AppNotifyTone {
  const level = (message || '').toLowerCase().trim();
  if (level === 'error' || level === 'warning') return 'error';
  if (level === 'info') return 'info';
  if (level === 'success') return 'success';
  const head = title.toLowerCase();
  if (
    head.includes('xato') ||
    head.includes('error') ||
    head.includes('ошибк') ||
    head.includes('failed') ||
    head.includes('муваффақиятсиз')
  ) {
    return 'error';
  }
  return 'success';
}

function displayMessage(message?: string): string | undefined {
  if (!message) return undefined;
  if (LOG_LEVELS.has(message.toLowerCase().trim())) return undefined;
  return message;
}

export function notify(title: string, message?: string, tone?: AppNotifyTone): void {
  const resolvedTone = tone ?? inferTone(title, message);
  const body = displayMessage(message);

  if (dialogHost) {
    dialogHost.notify({ title, message: body, tone: resolvedTone });
    return;
  }

  if (Platform.OS !== 'web') {
    Alert.alert(title, body);
    return;
  }

  const tg = telegramWebApp();
  if (tg?.showAlert) {
    try {
      tg.showAlert(joinText(title, body));
      return;
    } catch {
      // fall through
    }
  }
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(joinText(title, body));
  }
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export function confirmAction({
  title,
  message,
  confirmText,
  cancelText,
  destructive,
}: ConfirmOptions): Promise<boolean> {
  if (dialogHost) {
    return new Promise((resolve) => {
      dialogHost!.confirm({
        title,
        message,
        confirmText,
        cancelText,
        destructive,
        resolve,
      });
    });
  }

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
      // fall through
    }
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(joinText(title, message)));
  }
  return Promise.resolve(false);
}
