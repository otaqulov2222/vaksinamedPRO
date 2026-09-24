import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LatLng, RouteInfo } from '@/lib/maps';
import { hasValidCoords } from '@/lib/maps';

type Branch = {
  id: number;
  name: string;
  address: string;
  phone?: string;
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
  height?: number;
  countryView?: boolean;
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
  if (!document.getElementById('vaksina-map-css-v3')) {
    const style = document.createElement('style');
    style.id = 'vaksina-map-css-v3';
    style.textContent = `
      .vm-pin {
        width: 18px; height: 18px; background: #5C328E; border: 3px solid #FFCC00;
        border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(42,16,78,.35);
      }
      .vm-pin.selected {
        width: 22px; height: 22px; background: #2A104E; border-width: 3.5px;
        box-shadow: 0 0 0 5px rgba(92,50,142,.2), 0 3px 10px rgba(42,16,78,.4);
      }
      .vm-user {
        width: 14px; height: 14px; border-radius: 50%; background: #2563EB;
        border: 3px solid #fff; box-shadow: 0 0 0 5px rgba(37,99,235,.22);
      }
      .leaflet-container { font-family: Inter, Segoe UI, sans-serif; background: #F3F0EA; border-radius: 18px; }
      .leaflet-container.vm-map-locked { touch-action: pan-y !important; cursor: pointer; }
      .leaflet-container.vm-map-active { touch-action: none !important; cursor: grab; }
      .leaflet-control-zoom {
        border: 0 !important; margin: 12px 12px 0 0 !important;
        box-shadow: 0 4px 16px rgba(42,16,78,.14) !important;
        border-radius: 12px !important; overflow: hidden;
      }
      .leaflet-control-zoom a {
        width: 38px !important; height: 38px !important; line-height: 38px !important;
        color: #5C328E !important; font-weight: 700 !important; background: #fff !important;
      }
      .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,.75) !important; }
    `;
    document.head.appendChild(style);
  }
}

function setMapInteractive(map: any, active: boolean) {
  if (!map) return;
  const el = map.getContainer?.() as HTMLElement | undefined;
  if (active) {
    map.dragging?.enable();
    map.touchZoom?.enable();
    map.doubleClickZoom?.enable();
    map.scrollWheelZoom?.enable();
    map.boxZoom?.enable();
    map.keyboard?.enable();
    if (el) {
      el.classList.add('vm-map-active');
      el.classList.remove('vm-map-locked');
    }
  } else {
    map.dragging?.disable();
    map.touchZoom?.disable();
    map.doubleClickZoom?.disable();
    map.scrollWheelZoom?.disable();
    map.boxZoom?.disable();
    map.keyboard?.disable();
    if (map.tap) map.tap.disable();
    if (el) {
      el.classList.add('vm-map-locked');
      el.classList.remove('vm-map-active');
    }
  }
}

const UZ_CENTER: LatLng = { lat: 41.3, lng: 64.5 };
const UZ_ZOOM = 5.4;

export default function BranchMap({
  branches,
  selectedId,
  userLocation,
  route,
  onSelect,
  height = 320,
  countryView = true,
}: Props) {
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
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  activeRef.current = active;

  const mappable = useMemo(() => branches.filter((b) => hasValidCoords(b)), [branches]);

  const activate = useCallback(() => {
    setActive(true);
    setMapInteractive(mapRef.current, true);
  }, []);

  const deactivate = useCallback(() => {
    setActive(false);
    setMapInteractive(mapRef.current, false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureLeafletAssets();

    async function boot() {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = countryView
        ? UZ_CENTER
        : userLocation && hasValidCoords(userLocation)
          ? userLocation
          : UZ_CENTER;
      const zoom = countryView ? UZ_ZOOM : 12;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
      }).setView([start.lat, start.lng], zoom);

      L.control.zoom({ position: 'topright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      routeRef.current = L.layerGroup().addTo(map);
      setMapInteractive(map, false);

      const unlock = () => {
        if (activeRef.current) return;
        setActive(true);
        setMapInteractive(map, true);
      };
      map.on('click', unlock);
      map.on('zoomstart', unlock);

      setTimeout(() => map.invalidateSize(), 100);
    }

    // Container must exist before Leaflet boots. Retry briefly if first paint raced.
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

  // Sahifa scroll bo‘lganda xaritani qayta qulflash
  useEffect(() => {
    if (!active) return;
    const onScroll = () => deactivate();
    const onPointerDown = (event: PointerEvent) => {
      const root = containerRef.current?.parentElement;
      if (root && !root.contains(event.target as Node)) deactivate();
    };
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [active, deactivate]);

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
        const selected = branch.id === selectedId;
        const size = selected ? 22 : 18;
        const marker = L.marker([branch.lat, branch.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="vm-pin${selected ? ' selected' : ''}"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size],
          }),
          zIndexOffset: selected ? 800 : 0,
        });

        marker.bindTooltip(branch.name.replace(/^Vaksina Med\s*[·•]\s*/, ''), {
          direction: 'top',
          offset: [0, -18],
          opacity: 0.95,
        });
        marker.on('click', () => {
          if (!activeRef.current) {
            setActive(true);
            setMapInteractive(map, true);
          }
          onSelectRef.current(branch);
        });
        marker.addTo(layer);
        markersRef.current.set(branch.id, marker);
      });

      if (mappable.length > 0) {
        setTimeout(() => map.invalidateSize(), 50);
      }

      if (!fittedRef.current && mappable.length > 0 && countryView) {
        const bounds = L.latLngBounds(mappable.map((b) => [b.lat, b.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.18), { maxZoom: 7, animate: false });
        fittedRef.current = true;
      } else if (selectedId && markersRef.current.has(selectedId)) {
        const selected = mappable.find((item) => item.id === selectedId);
        if (selected && !route?.coordinates?.length && map.getZoom() > 8) {
          map.panTo([selected.lat, selected.lng], { animate: true });
        }
      }
    }

    void syncMarkers();
    // If Leaflet is still booting when branches arrive, sync once more shortly after.
    const retry = setTimeout(() => {
      if (mapRef.current && layerRef.current) void syncMarkers();
    }, 200);
    return () => clearTimeout(retry);
  }, [mappable, selectedId, countryView, route]);

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

  // Always mount the Leaflet container. Early-return when empty skipped the <div>,
  // so boot() never saw containerRef and markers never appeared after load.
  return (
    <View ref={wrapRef} style={[styles.wrap, { height }]}>
      <div ref={containerRef as any} style={{ width: '100%', height: '100%', borderRadius: 18 }} />
      {mappable.length === 0 ? (
        <View style={[styles.emptyOverlay, styles.emptyWrap]} pointerEvents="none">
          <Text style={styles.emptyText}>Xaritada joylashuvi mavjud emas</Text>
        </View>
      ) : null}
      {!active && mappable.length > 0 ? (
        <Pressable
          onPress={activate}
          accessibilityLabel="Xaritani faollashtirish"
          style={[styles.lockOverlay, { touchAction: 'pan-y' } as any]}
        />
      ) : null}
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
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    zIndex: 400,
    // Zoom tugmalari ochiq qolsin (o‘ng yuqori)
    right: 56,
  },
});