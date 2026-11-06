import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { LatLng } from '@/lib/maps';
import { hasValidCoords } from '@/lib/maps';

export type DeviceLocationError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export type DeviceLocationResult =
  | { ok: true; coords: LatLng }
  | { ok: false; error: DeviceLocationError };

function webGeolocation(): Promise<DeviceLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, error: 'unsupported' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!hasValidCoords(coords)) {
          resolve({ ok: false, error: 'unavailable' });
          return;
        }
        resolve({ ok: true, coords });
      },
      (err) => {
        // 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
        if (err?.code === 1) resolve({ ok: false, error: 'denied' });
        else if (err?.code === 3) resolve({ ok: false, error: 'timeout' });
        else resolve({ ok: false, error: 'unavailable' });
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  });
}

/**
 * Resolve current device coordinates for map pickers.
 * Web: prefer browser Geolocation API (more reliable than expo-location on Chrome).
 * Native: expo-location.
 * Never conflate GPS/timeout failures with permission denial.
 */
export async function getDeviceLocation(opts?: {
  requestPermission?: boolean;
}): Promise<DeviceLocationResult> {
  const requestPermission = opts?.requestPermission !== false;

  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (perm.state === 'denied') {
            return { ok: false, error: 'denied' };
          }
        } catch {
          // permissions.query(geolocation) unsupported in some browsers — continue
        }
      }
      return await webGeolocation();
    } catch {
      return { ok: false, error: 'unavailable' };
    }
  }

  try {
    let status: Location.PermissionStatus;
    if (requestPermission) {
      ({ status } = await Location.requestForegroundPermissionsAsync());
    } else {
      ({ status } = await Location.getForegroundPermissionsAsync());
    }
    if (status !== Location.PermissionStatus.GRANTED) {
      return { ok: false, error: 'denied' };
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!hasValidCoords(coords)) {
      return { ok: false, error: 'unavailable' };
    }
    return { ok: true, coords };
  } catch {
    // Permission may be granted but GPS / OS location services fail
    return { ok: false, error: 'unavailable' };
  }
}
