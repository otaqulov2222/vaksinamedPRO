import { Feather } from '@/components/AppIcon';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useApp } from '@/context/AppContext';
import type { LatLng, RouteInfo } from '@/lib/maps';
import { hasValidCoords, isPlausibleServiceArea } from '@/lib/maps';

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
  onRequestRoute?: (branch: Branch) => void;
  onPickBranch?: (branch: Branch) => void;
  pickOriginActive?: boolean;
  onPickOrigin?: (point: LatLng) => void;
  /** Parent ScrollView should disable while map is being dragged. */
  onMapGestureChange?: (active: boolean) => void;
  height?: number;
  countryView?: boolean;
};

function shortName(name: string) {
  return String(name).replace(/^Vaksina Med\s*[·•]\s*/i, '').trim();
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMapHtml(labels: { showRoute: string; select: string }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; width:100%; height:100%; background:#F3F0EA; touch-action: none; }
    * { -webkit-user-select: none; user-select: none; }
    .vm-pin {
      width: 18px; height: 18px; background: #5C328E; border: 3px solid #FFCC00;
      border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(42,16,78,.35);
    }
    .vm-pin.selected {
      width: 22px; height: 22px; background: #2A104E; border-width: 3.5px;
      box-shadow: 0 0 0 5px rgba(92,50,142,.25), 0 3px 12px rgba(42,16,78,.45);
    }
    .vm-user {
      width: 18px; height: 18px; border-radius: 50%; background: #2563EB;
      border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(37,99,235,.28);
    }
    .leaflet-container { font-family: Inter, Segoe UI, sans-serif; background: #F3F0EA; }
    .leaflet-control-zoom {
      border: 0 !important; margin: 12px 12px 0 0 !important;
      box-shadow: 0 4px 16px rgba(42,16,78,.14) !important;
      border-radius: 12px !important; overflow: hidden;
    }
    .leaflet-control-zoom a {
      width: 36px !important; height: 36px !important; line-height: 36px !important;
      color: #5C328E !important; font-weight: 700 !important; background: #fff !important;
    }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-popup-content-wrapper {
      border-radius: 16px !important;
      box-shadow: 0 10px 28px rgba(42, 16, 78, 0.22) !important;
      border: 1px solid rgba(92, 50, 142, 0.12) !important;
    }
    .leaflet-popup-content { margin: 10px 12px !important; min-width: 190px; max-width: 250px; }
    .vm-popup-title { font-size: 14px; font-weight: 700; color: #2A104E; margin-bottom: 2px; }
    .vm-popup-addr { font-size: 11px; color: #64748B; margin-bottom: 6px; line-height: 1.35; }
    .vm-popup-hours {
      display: inline-block; font-size: 10px; font-weight: 700; color: #0D9488;
      background: #ECFDF5; border-radius: 6px; padding: 2px 7px; margin-bottom: 8px;
    }
    .vm-popup-actions { display: flex; gap: 6px; margin-top: 4px; }
    .vm-popup-btn {
      flex: 1; padding: 7px 8px; border-radius: 10px; font-size: 11px; font-weight: 700;
      border: none; cursor: pointer;
    }
    .vm-popup-btn-nav { background: #FFCC00; color: #120724; }
    .vm-popup-btn-select { background: #5C328E; color: #fff; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const LABELS = ${JSON.stringify(labels)};
    const UZ_BOUNDS = [[36.8, 58.8], [42.9, 72.9]];
    const UZ_CENTER = [41.2, 66.8];
    const WIDE_BOUNDS = [[-85, -180], [85, 180]];
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      scrollWheelZoom: false,
      boxZoom: true,
      keyboard: true,
      inertia: true,
      inertiaDeceleration: 2500,
      easeLinearity: 0.2,
      minZoom: 4,
      maxBounds: WIDE_BOUNDS,
      maxBoundsViscosity: 0.2
    }).setView(UZ_CENTER, 5.2);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      updateWhenIdle: false,
      keepBuffer: 2
    }).addTo(map);
    map.fitBounds(UZ_BOUNDS, { padding: [10, 10] });

    const branchLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);
    const markers = new Map();
    let userMarker = null;
    let pickOriginActive = false;
    let selectedId = null;
    let hasRoute = false;
    let lastBranchKey = '';

    function post(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    // Tell RN to lock the outer ScrollView while the map is being dragged.
    map.on('dragstart zoomstart', function () { post({ type: 'gesture', active: true }); });
    map.on('dragend zoomend', function () { post({ type: 'gesture', active: false }); });
    document.addEventListener('touchstart', function () { post({ type: 'gesture', active: true }); }, { passive: true });
    document.addEventListener('touchend', function () { post({ type: 'gesture', active: false }); }, { passive: true });
    document.addEventListener('touchcancel', function () { post({ type: 'gesture', active: false }); }, { passive: true });

    map.on('click', function (e) {
      if (!pickOriginActive) return;
      post({ type: 'pickOrigin', lat: e.latlng.lat, lng: e.latlng.lng });
    });

    function syncBranches(list, selId, keepCamera) {
      selectedId = selId;
      var key = (list || []).map(function (b) { return b.id; }).join(',') + '|' + String(selId) + '|' + (hasRoute ? '1' : '0');
      var sameMarkers = key === lastBranchKey;
      if (!sameMarkers) {
        lastBranchKey = key;
        branchLayer.clearLayers();
        markers.clear();
        (list || []).forEach(function (branch) {
          var isSelected = branch.id === selId;
          var size = isSelected ? 22 : 18;
          var marker = L.marker([branch.lat, branch.lng], {
            icon: L.divIcon({
              className: '',
              html: '<div class="vm-pin' + (isSelected ? ' selected' : '') + '"></div>',
              iconSize: [size, size],
              iconAnchor: [size / 2, size]
            }),
            zIndexOffset: isSelected ? 800 : 0
          });
          marker.bindTooltip(branch.name, { direction: 'top', offset: [0, -18], opacity: 0.95 });

          var hoursHtml = '';
          if (branch.is24h || String(branch.hours || '').indexOf('24') >= 0) {
            hoursHtml = '<div class="vm-popup-hours">24/7</div>';
          } else if (branch.hours) {
            hoursHtml = '<div class="vm-popup-hours">' + branch.hours + '</div>';
          }
          var popup = document.createElement('div');
          popup.innerHTML =
            '<div class="vm-popup-title">' + branch.name + '</div>' +
            '<div class="vm-popup-addr">' + branch.address + '</div>' +
            hoursHtml +
            '<div class="vm-popup-actions">' +
            '<button class="vm-popup-btn vm-popup-btn-nav" type="button">↗ ' + LABELS.showRoute + '</button>' +
            '<button class="vm-popup-btn vm-popup-btn-select" type="button">✓ ' + LABELS.select + '</button>' +
            '</div>';
          popup.querySelector('.vm-popup-btn-nav').addEventListener('click', function (ev) {
            ev.stopPropagation();
            marker.closePopup();
            post({ type: 'requestRoute', id: branch.id });
          });
          popup.querySelector('.vm-popup-btn-select').addEventListener('click', function (ev) {
            ev.stopPropagation();
            post({ type: 'pickBranch', id: branch.id });
          });
          marker.bindPopup(popup, { offset: [0, -14], closeButton: true, autoPan: true });
          marker.on('click', function (event) {
            if (pickOriginActive) {
              post({ type: 'pickOrigin', lat: event.latlng.lat, lng: event.latlng.lng });
              return;
            }
            if (!hasRoute) map.flyTo([branch.lat, branch.lng], Math.max(map.getZoom(), 14), { duration: 0.4 });
            marker.openPopup();
            post({ type: 'select', id: branch.id });
          });
          marker.addTo(branchLayer);
          markers.set(branch.id, marker);
        });
      } else {
        // Only refresh selected pin style
        markers.forEach(function (marker, id) {
          var isSelected = id === selId;
          var size = isSelected ? 22 : 18;
          marker.setIcon(L.divIcon({
            className: '',
            html: '<div class="vm-pin' + (isSelected ? ' selected' : '') + '"></div>',
            iconSize: [size, size],
            iconAnchor: [size / 2, size]
          }));
          marker.setZIndexOffset(isSelected ? 800 : 0);
        });
      }

      if (keepCamera || hasRoute) {
        setTimeout(function () { map.invalidateSize(); }, 40);
        return;
      }
      if (!list || !list.length) {
        map.fitBounds(UZ_BOUNDS, { padding: [10, 10] });
        return;
      }
      var selected = selId != null ? list.find(function (b) { return b.id === selId; }) : null;
      if (selected) {
        map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 14), { duration: 0.4 });
        var m = markers.get(selected.id);
        if (m) setTimeout(function () { m.openPopup(); }, 300);
      } else if (list.length < 120) {
        var bounds = L.latLngBounds(list.map(function (b) { return [b.lat, b.lng]; }));
        map.fitBounds(bounds.pad(0.08), { maxZoom: 13, animate: true });
      } else {
        map.fitBounds(UZ_BOUNDS, { padding: [10, 10] });
      }
      setTimeout(function () { map.invalidateSize(); }, 60);
    }

    function syncUser(point) {
      if (!point || !isFinite(point.lat) || !isFinite(point.lng)) {
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
        return;
      }
      if (!userMarker) {
        userMarker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: '',
            html: '<div class="vm-user"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          }),
          zIndexOffset: 1200
        }).addTo(map);
      } else {
        userMarker.setLatLng([point.lat, point.lng]);
      }
    }

    function syncRoute(coords) {
      routeLayer.clearLayers();
      if (!coords || !coords.length) {
        hasRoute = false;
        map.setMaxBounds(WIDE_BOUNDS);
        setTimeout(function () { map.invalidateSize(); }, 40);
        return;
      }
      hasRoute = true;
      // Allow panning along the full route (do not clip to UZ-only).
      map.setMaxBounds(WIDE_BOUNDS);
      var latlngs = coords.map(function (p) { return [Number(p.lat), Number(p.lng)]; })
        .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      if (latlngs.length < 2) {
        // Straight fallback segment still visible
        if (latlngs.length === 1 && userMarker) {
          latlngs = [userMarker.getLatLng(), L.latLng(latlngs[0][0], latlngs[0][1])];
        } else {
          return;
        }
      }
      L.polyline(latlngs, { color: '#5C328E', weight: 7, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayer);
      L.polyline(latlngs, { color: '#FFCC00', weight: 3.5, opacity: 1, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayer);
      L.circleMarker(latlngs[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(routeLayer);
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 9, color: '#FFCC00', weight: 3, fillColor: '#5C328E', fillOpacity: 1 }).addTo(routeLayer);
      map.fitBounds(L.latLngBounds(latlngs), { padding: [56, 56], maxZoom: 15, animate: true });
      setTimeout(function () { map.invalidateSize(); }, 80);
      setTimeout(function () { map.invalidateSize(); }, 280);
    }

    function setPickOrigin(active) {
      pickOriginActive = !!active;
      map.getContainer().style.cursor = pickOriginActive ? 'crosshair' : '';
    }

    function resetUzbekistan() {
      map.closePopup();
      hasRoute = false;
      routeLayer.clearLayers();
      map.setMaxBounds(WIDE_BOUNDS);
      map.fitBounds(UZ_BOUNDS, { padding: [16, 16], animate: true });
    }

    window.__VM_MAP__ = {
      syncBranches: syncBranches,
      syncUser: syncUser,
      syncRoute: syncRoute,
      setPickOrigin: setPickOrigin,
      resetUzbekistan: resetUzbekistan,
      invalidate: function () { map.invalidateSize(); }
    };
    post({ type: 'ready' });
  </script>
</body>
</html>`;
}

/**
 * Native: Leaflet/OSM in WebView — gestures unlocked from parent ScrollView.
 */
export default function BranchMap({
  branches,
  selectedId,
  userLocation,
  route,
  onSelect,
  onRequestRoute,
  onPickBranch,
  pickOriginActive = false,
  onPickOrigin,
  onMapGestureChange,
  height = 360,
}: Props) {
  const { t } = useApp();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => {
    const map = new Map<number, Branch>();
    branches.forEach((b) => map.set(Number(b.id), b));
    return map;
  }, [branches]);

  const mappable = useMemo(
    () =>
      branches
        .filter((b) => hasValidCoords(b))
        .map((b) => ({
          id: Number(b.id),
          name: escapeHtml(shortName(b.name)),
          address: escapeHtml(String(b.address || '')),
          hours: escapeHtml(String(b.hours || '')),
          is24h: Boolean(b.is24h),
          lat: Number(b.lat),
          lng: Number(b.lng),
        })),
    [branches],
  );

  const mapUser = useMemo(() => {
    if (!userLocation || !hasValidCoords(userLocation)) return null;
    // Still draw the blue dot even if far — but plausible area is preferred.
    return userLocation;
  }, [userLocation]);

  const html = useMemo(
    () =>
      buildMapHtml({
        showRoute: t('branches.showRoute'),
        select: t('branches.select'),
      }),
    [t],
  );

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}\ntrue;`);
  }, []);

  const setGesture = useCallback(
    (active: boolean) => {
      onMapGestureChange?.(active);
      if (gestureTimer.current) clearTimeout(gestureTimer.current);
      if (active) {
        // Safety: always release lock if touchend is missed
        gestureTimer.current = setTimeout(() => onMapGestureChange?.(false), 2500);
      }
    },
    [onMapGestureChange],
  );

  // Markers / selection — keep camera if a route is drawn
  useEffect(() => {
    if (!readyRef.current) return;
    const keepCamera = Boolean(route?.coordinates?.length);
    inject(
      `window.__VM_MAP__ && window.__VM_MAP__.syncBranches(${JSON.stringify(mappable)}, ${
        selectedId == null ? 'null' : Number(selectedId)
      }, ${keepCamera ? 'true' : 'false'})`,
    );
  }, [inject, mappable, selectedId, route?.coordinates?.length]);

  useEffect(() => {
    if (!readyRef.current) return;
    inject(
      `window.__VM_MAP__ && window.__VM_MAP__.syncUser(${
        mapUser ? JSON.stringify(mapUser) : 'null'
      })`,
    );
  }, [inject, mapUser]);

  useEffect(() => {
    if (!readyRef.current) return;
    inject(
      `window.__VM_MAP__ && window.__VM_MAP__.syncRoute(${
        route?.coordinates?.length ? JSON.stringify(route.coordinates) : '[]'
      })`,
    );
  }, [inject, route]);

  useEffect(() => {
    if (!readyRef.current) return;
    inject(`window.__VM_MAP__ && window.__VM_MAP__.setPickOrigin(${pickOriginActive ? 'true' : 'false'})`);
  }, [inject, pickOriginActive]);

  useEffect(() => {
    if (!readyRef.current) return;
    const id = setTimeout(() => inject('window.__VM_MAP__ && window.__VM_MAP__.invalidate()'), 80);
    return () => clearTimeout(id);
  }, [inject, height]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type === 'ready') {
          readyRef.current = true;
          inject(
            `window.__VM_MAP__ && window.__VM_MAP__.syncBranches(${JSON.stringify(mappable)}, ${
              selectedId == null ? 'null' : Number(selectedId)
            }, false)`,
          );
          inject(
            `window.__VM_MAP__ && window.__VM_MAP__.syncUser(${
              mapUser ? JSON.stringify(mapUser) : 'null'
            })`,
          );
          inject(
            `window.__VM_MAP__ && window.__VM_MAP__.syncRoute(${
              route?.coordinates?.length ? JSON.stringify(route.coordinates) : '[]'
            })`,
          );
          inject(`window.__VM_MAP__ && window.__VM_MAP__.setPickOrigin(${pickOriginActive ? 'true' : 'false'})`);
          return;
        }
        if (data?.type === 'gesture') {
          setGesture(Boolean(data.active));
          return;
        }
        if (data?.type === 'select') {
          const branch = byId.get(Number(data.id));
          if (branch) onSelect(branch);
          return;
        }
        if (data?.type === 'requestRoute') {
          const branch = byId.get(Number(data.id));
          if (branch) onRequestRoute?.(branch);
          return;
        }
        if (data?.type === 'pickBranch') {
          const branch = byId.get(Number(data.id));
          if (!branch) return;
          if (onPickBranch) onPickBranch(branch);
          else onSelect(branch);
          return;
        }
        if (data?.type === 'pickOrigin') {
          const lat = Number(data.lat);
          const lng = Number(data.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) onPickOrigin?.({ lat, lng });
        }
      } catch {
        // ignore
      }
    },
    [
      byId,
      inject,
      mapUser,
      mappable,
      onPickBranch,
      onPickOrigin,
      onRequestRoute,
      onSelect,
      pickOriginActive,
      route,
      selectedId,
      setGesture,
    ],
  );

  return (
    <View
      style={[styles.wrap, { height }]}
      onTouchStart={() => setGesture(true)}
      onTouchEnd={() => setGesture(false)}
      onTouchCancel={() => setGesture(false)}
    >
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
        nestedScrollEnabled
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        allowsInlineMediaPlayback
        onLoadEnd={() => {
          setTimeout(() => inject('window.__VM_MAP__ && window.__VM_MAP__.invalidate()'), 160);
        }}
      />
      {mappable.length === 0 ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyText}>{t('branches.mapNoCoords')}</Text>
        </View>
      ) : (
        <Pressable
          style={styles.uzbBadge}
          onPress={() => inject('window.__VM_MAP__ && window.__VM_MAP__.resetUzbekistan()')}
          accessibilityRole="button"
          accessibilityLabel={t('branches.overviewUzbekistan')}
        >
          <Feather name="globe" size={12} color="#5C328E" />
          <Text style={styles.uzbBadgeText}>{t('branches.overviewUzbekistan')}</Text>
        </Pressable>
      )}
      {pickOriginActive ? (
        <View style={styles.pickOriginBanner} pointerEvents="none">
          <Text style={styles.pickOriginText}>{t('branches.pickOriginHint')}</Text>
        </View>
      ) : null}
      {mapUser && !isPlausibleServiceArea(mapUser) && !route ? (
        <View style={styles.farBanner} pointerEvents="none">
          <Text style={styles.farBannerText}>{t('branches.locationFarHint')}</Text>
        </View>
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
    borderWidth: 1,
    borderColor: 'rgba(42,16,78,0.06)',
  },
  web: {
    flex: 1,
    backgroundColor: '#F3F0EA',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F3F0EA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 20,
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  uzbBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#2A104E',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  uzbBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#2A104E',
  },
  pickOriginBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 30,
    backgroundColor: 'rgba(42,16,78,0.92)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickOriginText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  farBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 28,
    backgroundColor: 'rgba(146,64,14,0.94)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  farBannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
