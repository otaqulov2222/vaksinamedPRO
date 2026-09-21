import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { LatLng, RouteInfo } from '@/lib/maps';
import { openYandexRoute } from '@/lib/maps';

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
  userLocation: LatLng;
  route: RouteInfo | null;
  onSelect: (branch: Branch) => void;
  onRequestRoute?: (branch: Branch) => void;
  height?: number;
  countryView?: boolean;
};

/** Native fallback — webda saytdagi karta ko‘rinishi ishlaydi. */
export default function BranchMap({ branches, selectedId, userLocation, route, onSelect, onRequestRoute, height = 300 }: Props) {
  const selected = branches.find((item) => item.id === selectedId) || branches[0];
  return (
    <View style={[styles.wrap, { height }]}>
      <View style={styles.fallback}>
        <Feather name="map" size={36} color="#5C328E" />
        <Text style={styles.title}>Har bir filial — o‘z nuqtasida</Text>
        <Text style={styles.sub}>
          {selected ? selected.name : 'Filial tanlang'} · {route ? `${route.distanceKm} km` : `${branches.length} nuqta`}
        </Text>
        {selected ? (
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (onRequestRoute) onRequestRoute(selected);
              else void openYandexRoute(userLocation, { lat: selected.lat, lng: selected.lng });
            }}
          >
            <Feather name="navigation" size={16} color="#120724" />
            <Text style={styles.btnText}>Eng yaqin filial</Text>
          </Pressable>
        ) : null}
        <View style={styles.chips}>
          {branches.slice(0, 6).map((branch) => (
            <Pressable key={branch.id} onPress={() => onSelect(branch)} style={[styles.chip, selectedId === branch.id && styles.chipActive]}>
              <Text style={[styles.chipText, selectedId === branch.id && styles.chipTextActive]} numberOfLines={1}>
                {branch.name.replace(/^Vaksina Med\s*[·•]\s*/i, '')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFF9E6' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#2A104E', textAlign: 'center' },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', textAlign: 'center' },
  btn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFCC00', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#120724' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 },
  chip: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#EADFF5', maxWidth: 140 },
  chipActive: { backgroundColor: '#5C328E', borderColor: '#5C328E' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#5C328E' },
  chipTextActive: { color: '#fff' },
});
