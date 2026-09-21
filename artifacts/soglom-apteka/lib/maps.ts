import { Linking, Platform } from 'react-native';
import { API_URL } from '@/lib/api';

export type LatLng = { lat: number; lng: number };

export type RouteInfo = {
  distanceKm: number;
  durationMin: number;
  coordinates: LatLng[];
};

const TASHKENT: LatLng = { lat: 41.3111, lng: 69.2797 };

export function defaultUserLocation(): LatLng {
  return TASHKENT;
}

export function yandexRouteUrl(from: LatLng, to: LatLng) {
  return `https://yandex.ru/maps/?rtext=${from.lat},${from.lng}~${to.lat},${to.lng}&rtt=auto&z=14`;
}

export async function openYandexRoute(from: LatLng, to: LatLng) {
  const url = yandexRouteUrl(from, to);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

function straightFallback(from: LatLng, to: LatLng): RouteInfo {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const distanceKm = Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(1));
  return {
    distanceKm,
    durationMin: Math.max(1, Math.round((distanceKm / 25) * 60)),
    coordinates: [from, to],
  };
}

export async function fetchDrivingRoute(from: LatLng, to: LatLng): Promise<RouteInfo | null> {
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
          distanceKm: data.distanceKm,
          durationMin: data.durationMin,
          coordinates: data.coordinates,
        };
      }
    }
  } catch {
    // fallback below
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const route = data?.routes?.[0];
      if (route?.geometry?.coordinates?.length) {
        return {
          distanceKm: Number((route.distance / 1000).toFixed(1)),
          durationMin: Math.max(1, Math.round(route.duration / 60)),
          coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
        };
      }
    }
  } catch {
    // last resort
  }

  return straightFallback(from, to);
}
