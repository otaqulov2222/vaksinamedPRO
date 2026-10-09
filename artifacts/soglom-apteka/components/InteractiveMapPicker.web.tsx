import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { useApp } from '@/context/AppContext';
import type { LatLng } from '@/lib/maps';
import { TASHKENT_DEFAULT, hasValidCoords } from '@/lib/maps';

type Props = {
  initialCenter?: LatLng | null;
  onLocationChange: (coords: LatLng) => void;
  height?: DimensionValue;
};

declare global {
  interface Window {
    ymaps?: any;
    __ymapsPromise?: Promise<any>;
  }
}

function getYmapsLang(lang: string): string {
  switch (lang) {
    case 'ru':
      return 'ru_RU';
    case 'en':
      return 'en_US';
    case 'uz':
    default:
      return 'uz_UZ';
  }
}

function loadYandexMapsApi(lang: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window')); // i18n-ignore
  if (window.ymaps && window.ymaps.Map) {
    return new Promise((resolve) => window.ymaps.ready(() => resolve(window.ymaps)));
  }
  if (window.__ymapsPromise) {
    return window.__ymapsPromise;
  }

  window.__ymapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('yandex-maps-js-sdk') as HTMLScriptElement | null;
    if (existing && window.ymaps) {
      window.ymaps.ready(() => resolve(window.ymaps));
      return;
    }

    const ymapsLang = getYmapsLang(lang);
    const script = document.createElement('script');
    script.id = 'yandex-maps-js-sdk';
    script.type = 'text/javascript';
    script.src = `https://api-maps.yandex.ru/2.1/?lang=${encodeURIComponent(ymapsLang)}&coordorder=latlong`;
    script.async = true;

    script.onload = () => {
      if (window.ymaps) {
        window.ymaps.ready(() => resolve(window.ymaps));
      } else {
        reject(new Error('Yandex Maps SDK failed to initialize')); // i18n-ignore
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load Yandex Maps script')); // i18n-ignore
    };

    document.head.appendChild(script);
  });

  return window.__ymapsPromise;
}

export default function InteractiveMapPicker({
  initialCenter,
  onLocationChange,
  height = '100%',
}: Props) {
  const { language, t } = useApp();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (mapRef.current && initialCenter && hasValidCoords(initialCenter)) {
      const c = mapRef.current.getCenter();
      const dist = Math.abs(c[0] - initialCenter.lat) + Math.abs(c[1] - initialCenter.lng);
      if (dist > 0.0001) {
        mapRef.current.setCenter([initialCenter.lat, initialCenter.lng], mapRef.current.getZoom() || 16, {
          duration: 250,
          checkZoomRange: true,
        });
      }
    }
  }, [initialCenter?.lat, initialCenter?.lng]);

  useEffect(() => {
    let cancelled = false;

    async function initYandexMap() {
      try {
        const ymaps = await loadYandexMapsApi(language);
        if (cancelled || !containerRef.current || mapRef.current) return;

        const center = initialCenter && hasValidCoords(initialCenter) ? initialCenter : TASHKENT_DEFAULT;

        const map = new ymaps.Map(
          containerRef.current,
          {
            center: [center.lat, center.lng],
            zoom: 16,
            controls: ['zoomControl'],
          },
          {
            suppressMapOpenBlock: true,
            yandexMapDisablePoiInteractivity: false,
          },
        );

        mapRef.current = map;

        const handleMove = () => {
          if (!mapRef.current) return;
          const c = mapRef.current.getCenter();
          if (Array.isArray(c) && c.length >= 2) {
            onLocationChangeRef.current({ lat: c[0], lng: c[1] });
          }
        };

        map.events.add('actionend', handleMove);
        map.events.add('boundschange', handleMove);

        // Initial trigger
        onLocationChangeRef.current({ lat: center.lat, lng: center.lng });
        setMapReady(true);
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    }

    void initYandexMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch {
          // ignore cleanup error
        }
        mapRef.current = null;
      }
    };
  }, [language]);

  return (
    <View style={[styles.container, { height }]}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', outline: 'none', position: 'relative' }}
      />
      {!mapReady && !loadError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#5C328E" />
        </View>
      )}
      {loadError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{t('cart.checkoutMapGeocodeFailed')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#EBE6DC',
    position: 'relative',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F3F0EA',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F3F0EA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 5,
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
