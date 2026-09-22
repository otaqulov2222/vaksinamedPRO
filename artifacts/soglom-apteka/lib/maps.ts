import { Linking, Platform } from 'react-native';
import { API_URL } from '@/lib/api';

export type LatLng = { lat: number; lng: number };

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

export function yandexPointUrl(to: LatLng) {
  return `https://yandex.ru/maps/?pt=${to.lng},${to.lat}&z=15&l=map`;
}

export function yandexRouteUrl(from: LatLng, to: LatLng) {
  return `https://yandex.ru/maps/?rtext=${from.lat},${from.lng}~${to.lat},${to.lng}&rtt=auto&z=14`;
}

/** Open external maps. Without a real user origin, open destination point only — never invent from. */
export async function openYandexRoute(from: LatLng | null, to: LatLng) {
  const url = from && hasValidCoords(from) ? yandexRouteUrl(from, to) : yandexPointUrl(to);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
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
