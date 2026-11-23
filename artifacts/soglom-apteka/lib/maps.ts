import { API_URL } from '@/lib/api';

export type LatLng = { lat: number; lng: number };

export const TASHKENT_DEFAULT: LatLng = { lat: 41.311081, lng: 69.240562 };

export type DeliveryAddressSelection = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  district?: string | null;
  street?: string | null;
  house?: string | null;
  apartment?: string | null;
  entrance?: string | null;
  floor?: string | null;
  landmark?: string | null;
  courierNote?: string | null;
};

export type RouteInfo = {
  distanceKm: number;
  /** Only set when a routing provider returns duration — never invented from straight-line. */
  durationMin?: number;
  coordinates: LatLng[];
  source: 'osrm' | 'haversine';
};

export function hasValidCoords(point: { lat?: unknown; lng?: unknown } | null | undefined): boolean {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/**
 * GPS for this app only makes sense near Uzbekistan / Central Asia.
 * Emulator defaults (US / 0,0 ocean) produce 7000+ km routes and hide the blue dot
 * behind map maxBounds — reject those so we fall back to “pick on map”.
 */
export function isPlausibleServiceArea(point: LatLng | null | undefined): boolean {
  if (!point || !hasValidCoords(point)) return false;
  const { lat, lng } = point;
  return lat >= 35.5 && lat <= 46.5 && lng >= 55.5 && lng <= 76.5;
}

export function yandexPointUrl(to: LatLng) {
  return `https://yandex.ru/maps/?pt=${to.lng},${to.lat}&z=15&l=map`;
}

export function yandexRouteUrl(from: LatLng, to: LatLng) {
  return `https://yandex.ru/maps/?rtext=${from.lat},${from.lng}~${to.lat},${to.lng}&rtt=auto&z=14`;
}

/**
 * Open turn-by-turn navigation in the system maps app (Google / Apple / Yandex fallback).
 * Used on native where in-app Leaflet map is unavailable.
 */
export async function openExternalNavigation(
  from: LatLng | null,
  to: LatLng & { label?: string },
) {
  const label = encodeURIComponent(to.label || 'Vaksina Med');
  const { Platform, Linking } = await import('react-native');

  const candidates: string[] = [];
  if (from && hasValidCoords(from)) {
    // Google Maps directions (works on Android + iOS when Maps/Chrome installed)
    candidates.push(
      `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`,
    );
    candidates.push(yandexRouteUrl(from, to));
  } else {
    candidates.push(
      `https://www.google.com/maps/search/?api=1&query=${to.lat},${to.lng}`,
    );
    candidates.push(`geo:${to.lat},${to.lng}?q=${to.lat},${to.lng}(${label})`);
    candidates.push(yandexPointUrl(to));
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(candidates[0], '_blank', 'noopener,noreferrer');
    return;
  }

  for (const url of candidates) {
    try {
      const can = await Linking.canOpenURL(url);
      if (can || url.startsWith('https://')) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // try next
    }
  }
}

/** @deprecated Prefer openExternalNavigation on native. */
export async function openYandexRoute(from: LatLng | null, to: LatLng) {
  return openExternalNavigation(from, to);
}

function haversineKm(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(1));
}

/**
 * Prefer server OSRM proxy. Do not call public OSRM from the client (unbounded traffic).
 * If routing fails but both points are real, return haversine distance only (no invented ETA).
 */
export async function fetchDrivingRoute(from: LatLng | null, to: LatLng): Promise<RouteInfo | null> {
  if (!from || !hasValidCoords(from) || !hasValidCoords(to)) return null;

  try {
    const params = new URLSearchParams({
      fromLat: String(from.lat),
      fromLng: String(from.lng),
      toLat: String(to.lat),
      toLng: String(to.lng),
    });
    const response = await fetch(`${API_URL}/api/maps/route?${params}`);
    if (response.ok) {
      const data = await response.json();
      if (data?.coordinates?.length) {
        return {
          distanceKm: Number(data.distanceKm),
          durationMin: data.durationMin != null ? Number(data.durationMin) : undefined,
          coordinates: data.coordinates,
          source: 'osrm',
        };
      }
    }
  } catch {
    // fall through to haversine distance-only
  }

  return {
    distanceKm: haversineKm(from, to),
    coordinates: [from, to],
    source: 'haversine',
  };
}
