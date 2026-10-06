import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import type { LatLng } from '@/lib/maps';
import { TASHKENT_DEFAULT } from '@/lib/maps';

type Props = {
  initialCenter?: LatLng | null;
  onLocationChange: (coords: LatLng) => void;
  height?: DimensionValue;
};

function ensureLeafletAssets() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
}

export default function InteractiveMapPicker({
  initialCenter,
  onLocationChange,
  height = '100%',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    let cancelled = false;
    ensureLeafletAssets();

    async function initMap() {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const center = initialCenter || TASHKENT_DEFAULT;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([center.lat, center.lng], 16);

      L.control.zoom({ position: 'topright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap', // i18n-ignore
      }).addTo(map);

      mapRef.current = map;

      map.on('moveend', () => {
        const c = map.getCenter();
        onLocationChangeRef.current({ lat: c.lat, lng: c.lng });
      });

      onLocationChangeRef.current({ lat: center.lat, lng: center.lng });

      setTimeout(() => {
        if (!cancelled && mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 150);
    }

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <View style={[styles.container, { height }]}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#F3F0EA',
  },
});
