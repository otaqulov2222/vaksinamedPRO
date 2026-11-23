import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  getConnectivity,
  probeConnectivity,
  reportConnectivity,
  subscribeConnectivity,
} from '@/lib/connectivity';

function resolveProbeBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:5000`;
    }
    if (!window.location.origin.includes('localhost')) {
      return window.location.origin;
    }
  }
  return envUrl || 'https://api-staging.vaksinamedgps.uz';
}

/**
 * Live online/offline for OfflineBanner.
 * Web: navigator.onLine events. All platforms: API report + health probe on resume.
 */
export function useNetworkStatus(): { online: boolean; retry: () => void } {
  const [online, setOnline] = useState(getConnectivity);

  useEffect(() => subscribeConnectivity(setOnline), []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const sync = () => reportConnectivity(navigator.onLine);
      sync();
      window.addEventListener('online', sync);
      window.addEventListener('offline', sync);
      return () => {
        window.removeEventListener('online', sync);
        window.removeEventListener('offline', sync);
      };
    }
    return undefined;
  }, []);

  const retry = useCallback(() => {
    void probeConnectivity(resolveProbeBase());
  }, []);

  useEffect(() => {
    const base = resolveProbeBase();
    const onAppState = (state: string) => {
      if (state === 'active') void probeConnectivity(base);
    };
    const sub = AppState.addEventListener('change', onAppState);
    // Initial probe (covers native cold start / flaky first paint).
    void probeConnectivity(base);
    const interval = setInterval(() => {
      if (!getConnectivity()) void probeConnectivity(base);
    }, 8000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  return { online, retry };
}
