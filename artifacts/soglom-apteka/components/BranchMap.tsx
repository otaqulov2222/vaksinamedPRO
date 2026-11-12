import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@/components/AppIcon';
import { useApp } from '@/context/AppContext';
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
  onRequestRoute?: (branch: Branch) => void;
  onPickBranch?: (branch: Branch) => void;
  pickOriginActive?: boolean;
  onPickOrigin?: (point: LatLng) => void;
  height?: number;
  countryView?: boolean;
};

/**
 * Native: no react-native-maps in the repo — do not fake an interactive map.
 * Web uses BranchMap.web.tsx (Leaflet) with in-app polyline routing.
 * When GPS fails, pickOriginActive lets the user set start from a nearby branch chip
 * (same outcome as web map tap: origin → route).
 */
export default function BranchMap({
  branches,
  selectedId,
  route,
  onSelect,
  onRequestRoute,
  pickOriginActive = false,
  onPickOrigin,
  height = 300,
}: Props) {
  const { t } = useApp();
  const mappable = branches.filter((b) => hasValidCoords(b));
  const selected = mappable.find((item) => item.id === selectedId) || null;

  return (
    <View style={[styles.wrap, { minHeight: height }, pickOriginActive && styles.wrapPicking]}>
      <View style={styles.header}>
        <Feather name="map" size={28} color="#5C328E" />
        <Text style={styles.title}>{t('branches.mapNativeTitle')}</Text>
        <Text style={styles.sub}>
          {pickOriginActive ? t('branches.pickOriginNativeHint') : t('branches.mapNativeNote')}
        </Text>
      </View>

      {pickOriginActive ? (
        <View style={styles.pickBanner}>
          <Feather name="crosshair" size={14} color="#92400E" />
          <Text style={styles.pickBannerText}>{t('branches.pickOriginNativeHint')}</Text>
        </View>
      ) : null}

      {mappable.length === 0 ? (
        <Text style={styles.empty}>{t('branches.mapNoCoords')}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {mappable.slice(0, 24).map((branch) => {
            const active = selectedId === branch.id;
            return (
              <Pressable
                key={branch.id}
                onPress={() => {
                  if (pickOriginActive && onPickOrigin && hasValidCoords(branch)) {
                    onPickOrigin({ lat: Number(branch.lat), lng: Number(branch.lng) });
                    return;
                  }
                  onSelect(branch);
                }}
                style={[
                  styles.chip,
                  active && !pickOriginActive && styles.chipActive,
                  pickOriginActive && styles.chipPick,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  pickOriginActive
                    ? t('branches.pickOriginNativeChipA11y', {
                        name: branch.name.replace(/^Vaksina Med\s*[·•]\s*/i, ''),
                      })
                    : undefined
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    active && !pickOriginActive && styles.chipTextActive,
                    pickOriginActive && styles.chipTextPick,
                  ]}
                  numberOfLines={1}
                >
                  {branch.name.replace(/^Vaksina Med\s*[·•]\s*/i, '')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {selected ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName} numberOfLines={1}>
            {selected.name.replace(/^Vaksina Med\s*[·•]\s*/i, '')}
          </Text>
          <Text style={styles.selectedAddr} numberOfLines={2}>
            {selected.address}
          </Text>
          {route?.distanceKm != null ? (
            <Text style={styles.routeMeta}>
              {route.source === 'osrm'
                ? t('branches.routeByRoad', { km: route.distanceKm })
                : t('branches.routeStraight', { km: route.distanceKm })}
              {route.durationMin != null ? ` · ${t('branches.routeDurationMin', { min: route.durationMin })}` : ''}
            </Text>
          ) : null}
          {onRequestRoute && !pickOriginActive ? (
            <Pressable style={styles.btn} onPress={() => onRequestRoute(selected)}>
              <Feather name="navigation" size={16} color="#120724" />
              <Text style={styles.btnText}>{t('branches.showRoute')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFF9E6',
    padding: 16,
    gap: 10,
  },
  wrapPicking: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  header: { alignItems: 'center', gap: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#2A104E', textAlign: 'center' },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
  },
  pickBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFEDD5',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pickBannerText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#9A3412',
    lineHeight: 16,
  },
  empty: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 16,
  },
  chips: { gap: 6, paddingVertical: 4 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#EADFF5',
    maxWidth: 140,
  },
  chipActive: { backgroundColor: '#5C328E', borderColor: '#5C328E' },
  chipPick: { borderColor: '#EA580C', backgroundColor: '#FFF7ED' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#5C328E' },
  chipTextActive: { color: '#fff' },
  chipTextPick: { color: '#C2410C' },
  selected: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EADFF5',
    gap: 4,
  },
  selectedName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#2A104E' },
  selectedAddr: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' },
  routeMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#0D9488', marginTop: 4 },
  btn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFCC00',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#120724' },
});
