import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { LatLng, RouteInfo } from '@/lib/maps';
import { hasValidCoords, openYandexRoute } from '@/lib/maps';

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
  height?: number;
  countryView?: boolean;
};

/**
 * Native: no react-native-maps in the repo — do not fake an interactive map.
 * Web uses BranchMap.web.tsx (Leaflet). Native shows real branch list + external maps.
 */
export default function BranchMap({
  branches,
  selectedId,
  userLocation,
  route,
  onSelect,
  onRequestRoute,
  height = 300,
}: Props) {
  const mappable = branches.filter((b) => hasValidCoords(b));
  const selected = mappable.find((item) => item.id === selectedId) || null;

  return (
    <View style={[styles.wrap, { minHeight: height }]}>
      <View style={styles.header}>
        <Feather name="map" size={28} color="#5C328E" />
        <Text style={styles.title}>Filiallar xaritasi</Text>
        <Text style={styles.sub}>
          Interaktiv xarita webda ishlaydi. Native uchun `react-native-maps` (yoki Mapbox)
          paketini qo‘shish kerak — hozircha o‘rnatilmagan.
        </Text>
      </View>

      {mappable.length === 0 ? (
        <Text style={styles.empty}>Xaritada joylashuvi mavjud emas</Text>
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
                onPress={() => onSelect(branch)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
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
              {route.source === 'osrm' ? 'Yo‘l' : 'Masofa'}: {route.distanceKm} km
              {route.durationMin != null ? ` · ~${route.durationMin} daqiqa` : ''}
            </Text>
          ) : null}
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (onRequestRoute) onRequestRoute(selected);
              else void openYandexRoute(userLocation, { lat: selected.lat, lng: selected.lng });
            }}
          >
            <Feather name="navigation" size={16} color="#120724" />
            <Text style={styles.btnText}>Xaritada ochish</Text>
          </Pressable>
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
  header: { alignItems: 'center', gap: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#2A104E', textAlign: 'center' },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
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
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#5C328E' },
  chipTextActive: { color: '#fff' },
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
