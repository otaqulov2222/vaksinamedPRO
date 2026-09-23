import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BranchMap from '@/components/BranchMap';
import { useApp } from '@/context/AppContext';
import { api, type ApiError } from '@/lib/api';
import { fetchDrivingRoute, hasValidCoords, openYandexRoute, type LatLng, type RouteInfo } from '@/lib/maps';

function pickError(err: unknown) {
  const e = err as ApiError;
  return e?.message || (err instanceof Error ? err.message : 'Filial tanlanmadi');
}

function shortName(name: string) {
  return String(name).replace(/^Vaksina Med\s*[·•]\s*/i, '').trim();
}

function formatDistance(km: number | null | undefined) {
  if (km == null || !Number.isFinite(Number(km))) return null;
  return `${Number(km)} km`;
}

type LocStatus = 'pending' | 'granted' | 'denied' | 'unavailable';

export default function BranchesScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const from = String(params.from || '').toLowerCase();
  const insets = useSafeAreaInsets();
  const { refresh } = useApp();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [networkTotal, setNetworkTotal] = useState(0);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>('pending');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routing, setRouting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);

  const selected = useMemo(
    () => branches.find((item) => Number(item.id) === Number(selectedId)) || null,
    [branches, selectedId],
  );

  const mappableCount = useMemo(
    () => branches.filter((b) => hasValidCoords(b)).length,
    [branches],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!alive) return;
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocStatus('granted');
        } else {
          setUserLocation(null);
          setLocStatus('denied');
        }
      } catch {
        if (!alive) return;
        setUserLocation(null);
        setLocStatus('unavailable');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadBranches = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const lat = userLocation?.lat;
    const lng = userLocation?.lng;
    void api
      .branches(lat, lng, query, region)
      .then((data) => {
        const list = data.branches || [];
        setBranches(list);
        setNetworkTotal(data.total || list.length || 0);
        if (Array.isArray(data.regions) && data.regions.length) setRegions(data.regions);
        setSelectedId((prev) => {
          if (prev != null && list.some((b: any) => Number(b.id) === Number(prev))) return prev;
          const first = list[0]?.id;
          return first != null && Number.isFinite(Number(first)) ? Number(first) : null;
        });
      })
      .catch((err: Error) => {
        setBranches([]);
        setLoadError(err.message || 'Filiallarni yuklab bo‘lmadi');
      })
      .finally(() => setLoading(false));
  }, [query, region, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    // Wait until location permission attempt finishes so we don't fetch twice with fake coords.
    if (locStatus === 'pending') return;
    loadBranches();
  }, [locStatus, loadBranches]);

  const drawRoute = useCallback(
    async (branch: any, openExternal = false) => {
      if (!branch?.id) return;
      setSelectedId(Number(branch.id));
      setRoute(null);
      if (!hasValidCoords(branch)) {
        Alert.alert('Xarita', 'Bu filialning koordinatasi mavjud emas.');
        return;
      }
      setRouting(true);
      try {
        if (userLocation) {
          const info = await fetchDrivingRoute(userLocation, { lat: branch.lat, lng: branch.lng });
          setRoute(info);
        }
        if (openExternal) {
          await openYandexRoute(userLocation, { lat: branch.lat, lng: branch.lng });
        }
      } finally {
        setRouting(false);
      }
    },
    [userLocation],
  );

  const goNearest = useCallback(async () => {
    if (!userLocation) {
      Alert.alert(
        'Joylashuv',
        'Eng yaqin filialni aniqlash uchun joylashuv ruxsati kerak. Filiallar ro‘yxatidan tanlashingiz mumkin.',
      );
      return;
    }
    const nearest = branches.find((b) => b.distanceKm != null && hasValidCoords(b));
    if (!nearest) {
      Alert.alert('Filial', 'Yaqin filial topilmadi.');
      return;
    }
    await drawRoute(nearest, true);
  }, [branches, drawRoute, userLocation]);

  const pickForCart = useCallback(
    async (branch: any) => {
      const id = Number(branch?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      if (pickingRef.current || picking) return;
      pickingRef.current = true;
      setPicking(true);
      try {
        await api.setCartBranch(id);
        await refresh();
        // Prefer real stack parent (Profile / Checkout / Cart / Home).
        // Only when no history: return to cart/checkout if that was the caller; else Profile.
        if (router.canGoBack()) {
          router.back();
        } else if (from === 'checkout') {
          router.replace('/checkout');
        } else if (from === 'cart') {
          router.replace('/cart');
        } else {
          router.replace('/(tabs)/profile');
        }
      } catch (err) {
        const e = err as ApiError;
        const title = e?.code === 'BRANCH_CLOSED' ? 'Filial' : 'Xatolik';
        const message = pickError(err);
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(`${title}\n${message}`);
        } else {
          Alert.alert(title, message);
        }
      } finally {
        pickingRef.current = false;
        setPicking(false);
      }
    },
    [picking, refresh, from],
  );

  const locBanner =
    locStatus === 'denied'
      ? 'Joylashuv ruxsati berilmagan — masofa ko‘rsatilmaydi. Filial tanlash ishlaydi.'
      : locStatus === 'unavailable'
        ? 'Joylashuvni aniqlab bo‘lmadi — masofa ko‘rsatilmaydi.'
        : null;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#FFF9E6', '#FFFFFF', '#FFFFFF']} style={styles.heroCard}>
        <Text style={styles.heroTitle}>Har bir filial — o‘z nuqtasida</Text>
        <Pressable onPress={() => void goNearest()} style={styles.nearestBtn}>
          {routing ? (
            <ActivityIndicator color="#120724" />
          ) : (
            <Feather name="navigation" size={16} color="#120724" />
          )}
          <Text style={styles.nearestBtnText}>
            {userLocation ? 'Eng yaqin filial' : 'Filial tanlang'}
          </Text>
        </Pressable>

        {locBanner ? (
          <Text style={styles.locBanner}>{locBanner}</Text>
        ) : null}

        <View style={styles.mapFrame}>
          <BranchMap
            branches={branches}
            selectedId={selected?.id ?? null}
            userLocation={userLocation}
            route={route}
            onSelect={(branch) => void drawRoute(branch, false)}
            onRequestRoute={(branch) => void drawRoute(branch, true)}
            height={300}
            countryView
          />
        </View>
        {branches.length > 0 && mappableCount === 0 ? (
          <Text style={styles.locBanner}>Xaritada joylashuvi mavjud emas</Text>
        ) : null}
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Feather name="search" size={17} color="#5C328E" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filial, tuman, ko‘cha…"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')}>
            <Feather name="x" size={16} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable onPress={() => setRegion('')} style={[styles.chip, !region && styles.chipOn]}>
          <Text style={[styles.chipText, !region && styles.chipTextOn]}>
            Barchasi · {networkTotal}
          </Text>
        </Pressable>
        {regions.map((item) => {
          const on = region === item;
          return (
            <Pressable key={item} onPress={() => setRegion(on ? '' : item)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color="#5C328E" />
          <Text style={styles.stateText}>Yuklanmoqda...</Text>
        </View>
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Feather name="cloud-off" size={28} color="#94A3B8" />
          <Text style={styles.stateTitle}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={loadBranches}>
            <Text style={styles.retryBtnText}>Qayta urinish</Text>
          </Pressable>
        </View>
      ) : branches.length === 0 ? (
        <View style={styles.stateBox}>
          <Feather name="map-pin" size={28} color="#94A3B8" />
          <Text style={styles.stateTitle}>Filial topilmadi</Text>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.selectedCard}>
          <View style={styles.selectedTop}>
            <View style={styles.pinBadge}>
              <Feather name="map-pin" size={16} color="#FFCC00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedName}>{shortName(selected.name)}</Text>
              <Text style={styles.selectedAddr} numberOfLines={2}>
                {selected.address}
              </Text>
            </View>
            {formatDistance(selected.distanceKm) ? (
              <Text style={styles.selectedKm}>{formatDistance(selected.distanceKm)}</Text>
            ) : null}
          </View>
          {route?.distanceKm != null ? (
            <Text style={styles.routeHint}>
              {route.source === 'osrm' ? 'Yo‘l' : 'Masofa'}: {route.distanceKm} km
              {route.durationMin != null ? ` · ~${route.durationMin} daqiqa` : ''}
            </Text>
          ) : null}
          <View style={styles.ctaRow}>
            <Pressable
              disabled={routing || !hasValidCoords(selected)}
              onPress={() => void drawRoute(selected, true)}
              style={[styles.ctaYellow, { opacity: routing || !hasValidCoords(selected) ? 0.55 : 1 }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: routing || !hasValidCoords(selected) }}
              accessibilityLabel={`${shortName(selected.name)} — yo‘nalishni ko‘rsatish`}
            >
              <Feather name="navigation" size={15} color="#120724" />
              <Text style={styles.ctaYellowText}>Yo‘lni ko‘rsatish</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickForCart(selected)}
              disabled={picking}
              style={[styles.ctaPurple, picking && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: picking }}
              accessibilityLabel={`${shortName(selected.name)} filialini tanlash`}
            >
              {picking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={styles.ctaPurpleText}>Tanlash</Text>
                </>
              )}
            </Pressable>
            {selected.phone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${String(selected.phone).replace(/[^\d+]/g, '')}`)}
                style={styles.ctaCall}
                accessibilityRole="button"
                accessibilityLabel={`${shortName(selected.name)} ga qo‘ng‘iroq qilish`}
              >
                <Feather name="phone" size={15} color="#5C328E" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <Text style={styles.listHeading}>Dorixonalar ro‘yxati</Text>

      {branches.map((branch, index) => {
        const active = Number(branch.id) === Number(selected?.id);
        const open24 = branch.is24h || String(branch.hours || '').includes('24');
        const dist = formatDistance(branch.distanceKm);
        const name = shortName(branch.name);
        return (
          <View
            key={branch.id}
            style={[styles.row, active && styles.rowActive]}
          >
            <Pressable
              onPress={() => void drawRoute(branch, false)}
              style={styles.rowMain}
              accessibilityRole="button"
              accessibilityLabel={`${name} filialini tanlash${dist ? `, ${dist}` : ''}`}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.rowNum, active && styles.rowNumOn]}>
                <Text style={[styles.rowNumText, active && styles.rowNumTextOn]}>{index + 1}</Text>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTitle}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {name}
                  </Text>
                  {open24 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>24/7</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.rowAddr} numberOfLines={2}>
                  {branch.region} · {branch.address}
                </Text>
              </View>
              {dist ? <Text style={styles.rowKm}>{dist}</Text> : null}
            </Pressable>
            {hasValidCoords(branch) ? (
              <Pressable
                onPress={() => void drawRoute(branch, true)}
                style={styles.miniNav}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${name} — yo‘nalishni ko‘rsatish`}
              >
                <Feather name="navigation" size={12} color="#120724" />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F5F2' },
  pageContent: { padding: 16, gap: 12 },
  heroCard: {
    borderRadius: 24,
    padding: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(92,50,142,0.08)',
    shadowColor: '#2A104E',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 28,
    color: '#2A104E',
    marginBottom: 14,
  },
  nearestBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFCC00',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    marginBottom: 10,
    shadowColor: '#C9A000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  nearestBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#120724',
  },
  locBanner: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 16,
  },
  mapFrame: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(42,16,78,0.06)',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#EDE8F5',
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#2A104E',
    paddingVertical: 10,
    outlineStyle: 'none' as any,
  },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#EADFF5',
  },
  chipOn: { backgroundColor: '#5C328E', borderColor: '#5C328E' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5C328E' },
  chipTextOn: { color: '#fff' },
  stateBox: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#2A104E', textAlign: 'center' },
  stateText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' },
  retryBtn: {
    marginTop: 4,
    backgroundColor: '#5C328E',
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
  selectedCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EADFF5',
  },
  selectedTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pinBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#5C328E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedName: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#2A104E' },
  selectedAddr: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 16 },
  selectedKm: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#5C328E' },
  routeHint: { marginTop: 10, fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#0D9488' },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  ctaYellow: {
    flex: 1.3,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#FFCC00',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  ctaYellowText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#120724' },
  ctaPurple: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#5C328E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  ctaPurpleText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#fff' },
  ctaCall: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F3EAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#2A104E',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#EEEAF5',
    minHeight: 56,
  },
  rowActive: { borderColor: '#5C328E', backgroundColor: '#FBF8FF' },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowNum: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#F3EAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowNumOn: { backgroundColor: '#5C328E' },
  rowNumText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#5C328E' },
  rowNumTextOn: { color: '#fff' },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 13, color: '#2A104E' },
  badge: { backgroundColor: '#ECFDF5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#0D9488' },
  rowAddr: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#64748B', marginTop: 3, lineHeight: 15 },
  rowKm: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#2A104E', marginLeft: 4 },
  miniNav: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
