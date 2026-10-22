import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import type { LatLng, RouteInfo } from '@/lib/maps';
import { hasValidCoords } from '@/lib/maps';

type Branch = {
  id: number;
  name: string;
  address: string;
  phone?: string;
  hours?: string;
  is24h?: boolean;
  lat: number;
  lng: number;
};

type Props = {
  branches: Branch[];
  selectedId: number | null;
  userLocation: LatLng | null;
  route: RouteInfo | null;
  onSelect: (branch: Branch) => void;
  onRequestRoute: (branch: Branch) => void;
  onPickBranch?: (branch: Branch) => void;
  height?: number;
  countryView?: boolean;
};

const UZ_BOUNDS: [[number, number], [number, number]] = [
  [36.8, 58.8],
  [42.9, 72.9],
];
const UZ_CENTER: LatLng = { lat: 41.2, lng: 66.8 };
const UZ_ZOOM = 5.2;

function shortName(name: string) {
  return String(name).replace(/^Vaksina Med\s*[·•]\s*/i, '').trim();
}

function ensureLeafletAssets() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (!document.getElementById('vaksina-map-css-v4')) {
    const style = document.createElement('style');
    style.id = 'vaksina-map-css-v4';
    style.textContent = `
      .vm-pin {
        width: 18px; height: 18px; background: #5C328E; border: 3px solid #FFCC00;
        border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(42,16,78,.35);
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .vm-pin:hover {
        transform: rotate(-45deg) scale(1.15);
      }
      .vm-pin.selected {
        width: 22px; height: 22px; background: #2A104E; border-width: 3.5px;
        box-shadow: 0 0 0 5px rgba(92,50,142,.25), 0 3px 12px rgba(42,16,78,.45);
      }
      .vm-user {
        width: 14px; height: 14px; border-radius: 50%; background: #2563EB;
        border: 3px solid #fff; box-shadow: 0 0 0 5px rgba(37,99,235,.22);
      }
      .leaflet-container { font-family: Inter, Segoe UI, sans-serif; background: #F3F0EA; border-radius: 18px; }
      .leaflet-control-zoom {
        border: 0 !important; margin: 12px 12px 0 0 !important;
        box-shadow: 0 4px 16px rgba(42,16,78,.14) !important;
        border-radius: 12px !important; overflow: hidden;
      }
      .leaflet-control-zoom a {
        width: 36px !important; height: 36px !important; line-height: 36px !important;
        color: #5C328E !important; font-weight: 700 !important; background: #fff !important;
      }
      .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,.75) !important; }
      .leaflet-popup-content-wrapper {
        border-radius: 16px !important;
        box-shadow: 0 10px 28px rgba(42, 16, 78, 0.22) !important;
        padding: 4px !important;
        border: 1px solid rgba(92, 50, 142, 0.12) !important;
      }
      .leaflet-popup-content {
        margin: 10px 12px !important;
        font-family: 'Inter', system-ui, sans-serif !important;
        line-height: 1.4 !important;
        min-width: 190px !important;
        max-width: 250px !important;
      }
      .leaflet-popup-tip {
        box-shadow: 0 4px 12px rgba(42, 16, 78, 0.15) !important;
      }
      .vm-popup-title {
        font-size: 14px;
        font-weight: 700;
        color: #2A104E;
        margin-bottom: 2px;
      }
      .vm-popup-addr {
        font-size: 11px;
        color: #64748B;
        margin-bottom: 6px;
        line-height: 1.35;
      }
      .vm-popup-hours {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        color: #0D9488;
        background: #ECFDF5;
        border-radius: 6px;
        padding: 2px 7px;
        margin-bottom: 8px;
      }
      .vm-popup-actions {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .vm-popup-btn {
        flex: 1;
        padding: 7px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .vm-popup-btn-nav {
        background: #FFCC00;
        color: #120724;
      }
      .vm-popup-btn-select {
        background: #5C328E;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }
}

export default function BranchMap({
  branches,
  selectedId,
  userLocation,
  route,
  onSelect,
  onRequestRoute,
  onPickBranch,
  height = 320,
}: Props) {
  const { t } = useApp();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const userRef = useRef<any>(null);
  const markersRef = useRef<Map<number, any>>(new Map());
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onRequestRouteRef = useRef(onRequestRoute);
  onRequestRouteRef.current = onRequestRoute;
  const onPickBranchRef = useRef(onPickBranch);
  onPickBranchRef.current = onPickBranch;

  const mappable = useMemo(() => branches.filter((b) => hasValidCoords(b)), [branches]);

  const resetToUzbekistan = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.closePopup();
    map.fitBounds(UZ_BOUNDS, { padding: [16, 16], animate: true });
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureLeafletAssets();

    async function boot() {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true,
        scrollWheelZoom: false,
        boxZoom: true,
        keyboard: true,
        minZoom: 4.6,
        maxBounds: [
          [34.5, 54.0],
          [46.8, 76.0],
        ],
        maxBoundsViscosity: 0.85,
      }).setView([UZ_CENTER.lat, UZ_CENTER.lng], UZ_ZOOM);

      L.control.zoom({ position: 'topright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', // i18n-ignore: map data licence attribution
      }).addTo(map);

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      routeRef.current = L.layerGroup().addTo(map);

      map.fitBounds(UZ_BOUNDS, { padding: [10, 10] });
      setTimeout(() => {
        if (!mapRef.current) return;
        mapRef.current.invalidateSize();
        mapRef.current.fitBounds(UZ_BOUNDS, { padding: [10, 10] });
      }, 140);
    }

    void boot();
    const retry = setTimeout(() => {
      if (!cancelled && !mapRef.current) void boot();
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(retry);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
        routeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTimeout(() => map.invalidateSize(), 80);
  }, [height, mappable.length]);

  useEffect(() => {
    async function syncMarkers() {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();
      markersRef.current.clear();

      mappable.forEach((branch) => {
        const isSelected = branch.id === selectedId;
        const size = isSelected ? 22 : 18;
        const marker = L.marker([branch.lat, branch.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="vm-pin${isSelected ? ' selected' : ''}"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size],
          }),
          zIndexOffset: isSelected ? 800 : 0,
        });

        marker.bindTooltip(shortName(branch.name), {
          direction: 'top',
          offset: [0, -18],
          opacity: 0.95,
        });

        // Rich interactive popup with action buttons
        const popupContent = document.createElement('div');
        popupContent.className = 'vm-popup-card';
        const hoursHtml =
          branch.is24h || String(branch.hours || '').includes('24')
            ? '<div class="vm-popup-hours">24/7</div>'
            : branch.hours
              ? `<div class="vm-popup-hours">${branch.hours}</div>`
              : '';
        popupContent.innerHTML = `
          <div class="vm-popup-title">${shortName(branch.name)}</div>
          <div class="vm-popup-addr">${branch.address}</div>
          ${hoursHtml}
          <div class="vm-popup-actions">
            <button class="vm-popup-btn vm-popup-btn-nav" type="button">
              ↗ ${t('branches.showRoute')}
            </button>
            <button class="vm-popup-btn vm-popup-btn-select" type="button">
              ✓ ${t('branches.select')}
            </button>
          </div>
        `;

        const navBtn = popupContent.querySelector('.vm-popup-btn-nav');
        const selBtn = popupContent.querySelector('.vm-popup-btn-select');
        navBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          onRequestRouteRef.current?.(branch);
        });
        selBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onPickBranchRef.current) {
            onPickBranchRef.current(branch);
          } else {
            onSelectRef.current?.(branch);
          }
        });

        marker.bindPopup(popupContent, {
          className: 'vm-popup',
          offset: [0, -14],
          closeButton: true,
          autoPan: true,
        });

        marker.on('click', () => {
          map.flyTo([branch.lat, branch.lng], 15, { duration: 0.5 });
          marker.openPopup();
          onSelectRef.current?.(branch);
        });

        marker.addTo(layer);
        markersRef.current.set(branch.id, marker);
      });

      if (mappable.length > 0) {
        setTimeout(() => map.invalidateSize(), 50);
      }

      const selected = selectedId ? mappable.find((item) => item.id === selectedId) : null;
      if (selected && !route?.coordinates?.length) {
        const targetZoom = Math.max(map.getZoom(), 15);
        map.flyTo([selected.lat, selected.lng], targetZoom, { duration: 0.5 });
        const marker = markersRef.current.get(selected.id);
        if (marker) {
          setTimeout(() => marker.openPopup(), 400);
        }
      } else if (mappable.length > 0) {
        if (mappable.length < 120) {
          const regionBounds = L.latLngBounds(mappable.map((b) => [b.lat, b.lng] as [number, number]));
          map.fitBounds(regionBounds.pad(0.08), { maxZoom: 13, animate: true });
        } else if (!fittedRef.current) {
          map.fitBounds(UZ_BOUNDS, { padding: [10, 10], animate: false });
          fittedRef.current = true;
        }
      }
    }

    void syncMarkers();
    const retry = setTimeout(() => {
      if (mapRef.current && layerRef.current) void syncMarkers();
    }, 200);
    return () => clearTimeout(retry);
  }, [mappable, selectedId, route, t]);

  useEffect(() => {
    async function syncUser() {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      if (!map) return;

      if (!userLocation || !hasValidCoords(userLocation)) {
        if (userRef.current) {
          map.removeLayer(userRef.current);
          userRef.current = null;
        }
        return;
      }

      if (!userRef.current) {
        userRef.current = L.marker([userLocation.lat, userLocation.lng], {
          icon: L.divIcon({
            className: '',
            html: '<div class="vm-user"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        userRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      }
    }
    void syncUser();
  }, [userLocation]);

  useEffect(() => {
    async function syncRoute() {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      const routeLayer = routeRef.current;
      if (!map || !routeLayer) return;
      routeLayer.clearLayers();
      if (!route?.coordinates?.length) return;

      const latlngs = route.coordinates.map((point) => [point.lat, point.lng] as [number, number]);
      L.polyline(latlngs, { color: '#5C328E', weight: 6, opacity: 0.9, lineJoin: 'round' }).addTo(routeLayer);
      L.polyline(latlngs, { color: '#FFCC00', weight: 3, opacity: 0.95 }).addTo(routeLayer);
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 14 });
    }
    void syncRoute();
  }, [route]);

  return (
    <View ref={wrapRef} style={[styles.wrap, { height }]}>
      <div ref={containerRef as any} style={{ width: '100%', height: '100%', borderRadius: 18 }} />
      {mappable.length === 0 ? (
        <View style={[styles.emptyOverlay, styles.emptyWrap]} pointerEvents="none">
          <Text style={styles.emptyText}>{t('branches.mapNoCoords')}</Text>
        </View>
      ) : (
        <Pressable
          style={styles.uzbBadge}
          onPress={resetToUzbekistan}
          accessibilityRole="button"
          accessibilityLabel={t('branches.overviewUzbekistan')}
        >
          <Feather name="globe" size={12} color="#5C328E" />
          <Text style={styles.uzbBadgeText}>{t('branches.overviewUzbekistan')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#F3F0EA',
    position: 'relative',
  },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  emptyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F3F0EA',
    zIndex: 500,
  },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#64748B', textAlign: 'center' },
  uzbBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 400,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    boxShadow: '0 4px 12px rgba(42, 16, 78, 0.14)',
  },
  uzbBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#2A104E',
  },
});
