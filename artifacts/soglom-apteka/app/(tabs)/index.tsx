import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useApp } from '@/context/AppContext';
import { ProgressLine, Screen, formatUzs } from '@/components/AppUI';
import { api } from '@/lib/api';

const PURPLE = '#5C328E';
const PURPLE_DEEP = '#2A104E';
const YELLOW = '#FFCC00';

function shortBranch(name?: string) {
  return String(name || '').replace(/^Vaksina Med\s*[·•]\s*/i, '').trim() || 'Filial';
}

const QUICK = [
  { icon: 'pill' as const, label: 'Dori qidirish', to: '/(tabs)/catalog', bg: '#FFF4CC' },
  { icon: 'map-marker-outline' as const, label: 'Dorixonalar', to: '/branches', bg: '#F3EAFB' },
  { icon: 'qrcode-scan' as const, label: 'Mening QR kodim', to: '/qr', bg: '#F3EAFB' },
  { icon: 'truck-delivery-outline' as const, label: 'Yetkazib berish', to: '/checkout', bg: '#F3EAFB' },
  { icon: 'file-document-outline' as const, label: 'Retsept', to: '/(tabs)/catalog', bg: '#FFF8E0' },
];

export default function HomeScreen() {
  const { t, balance, user, cartCount } = useApp();
  const [nearest, setNearest] = useState<any>(null);
  const [nearestLocated, setNearestLocated] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [query, setQuery] = useState('');
  const [nextTierTarget, setNextTierTarget] = useState<number | null>(null);
  /** Tier thresholds use cumulative purchases (fromTotal), not cashback balance. */
  const spentTowardTier = Number(user?.total || 0);
  const left =
    nextTierTarget != null ? Math.max(0, nextTierTarget - spentTowardTier) : null;
  const tierProgress =
    nextTierTarget != null
      ? Math.min(1, Math.max(0, spentTowardTier / Math.max(1, nextTierTarget)))
      : 0;

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError(false);
    void api
      .products('?limit=8&offset=0')
      .then((data) => {
        setProducts(data.products || []);
        setProductsError(false);
      })
      .catch(() => {
        setProducts([]);
        setProductsError(true);
      })
      .finally(() => setProductsLoading(false));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const data = await api.branches(pos.coords.latitude, pos.coords.longitude);
          setNearest(data.branches?.[0] || null);
          setNearestLocated(Boolean(data.branches?.[0]?.distanceKm != null));
          return;
        }
      } catch {
        // fall through — list without invented proximity
      }
      try {
        const data = await api.branches();
        setNearest(data.branches?.[0] || null);
        setNearestLocated(false);
      } catch {
        setNearest(null);
        setNearestLocated(false);
      }
    })();
    void api.cashbackRules().then((r) => {
      const tiers = Array.isArray(r?.tiers) ? r.tiers : [];
      const gold = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes('gold'));
      const platinum = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes('plat'));
      const userTier = String(user?.tier || '').toLowerCase();
      const threshold = (t: any) => Number(t?.fromTotal ?? t?.minSpend);
      if (userTier.includes('plat')) {
        setNextTierTarget(null);
      } else if (userTier.includes('gold') && Number.isFinite(threshold(platinum))) {
        setNextTierTarget(threshold(platinum));
      } else if (Number.isFinite(threshold(gold))) {
        setNextTierTarget(threshold(gold));
      } else if (Number.isFinite(threshold(platinum))) {
        setNextTierTarget(threshold(platinum));
      } else {
        setNextTierTarget(null);
      }
    }).catch(() => setNextTierTarget(null));
    loadProducts();
  }, [loadProducts, user?.tier]);

  const onSearch = () => {
    const q = query.trim();
    router.push({ pathname: '/(tabs)/catalog', params: q ? { q } : {} } as any);
  };

  const displayProducts = products.map((p) => ({
    id: p.id,
    name: String(p.nameUz || p.nameRu || ''),
    price: Number(p.price || 0),
    imageUrl: p.imageUrl,
  }));

  return (
    <Screen>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/images/vaksina-mark-clean.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.brandLine}>
              <Text style={styles.brandVaksina}>VAKSINA </Text>
              <Text style={styles.brandMed}>MED</Text>
            </Text>
            <Text style={styles.brandSlogan} numberOfLines={1}>
              СОХРАНЯЯ ЗДОРОВЬЕ, ДАРИМ РАДОСТЬ ЖИЗНИ!
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.roundBtn} onPress={() => router.push('/promos')}>
            <Feather name="bell" size={18} color={PURPLE_DEEP} />
            <View style={styles.bellDot} />
          </Pressable>
          <Pressable style={styles.roundBtn} onPress={() => router.push('/cart')}>
            <Feather name="shopping-cart" size={18} color={PURPLE_DEEP} />
            {cartCount > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>
      </View>

      <Text style={styles.greet}>Salom, {user.name || 'mehmon'} 👋</Text>
      <Text style={styles.greetSub}>Bugun sizga nima kerak?</Text>

      {/* SEARCH */}
      <View style={styles.searchBox}>
        <Feather name="search" size={18} color="#94A3B8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Dori yoki mahsulot qidirish..."
          placeholderTextColor="#A8B0C0"
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <Pressable onPress={() => router.push('/qr')} hitSlop={8} accessibilityLabel="Mening QR kodim">
          <MaterialCommunityIcons name="qrcode" size={22} color={PURPLE} />
        </Pressable>
      </View>

      {/* HERO — fayldan, cho‘zilmasin */}
      <View style={styles.heroWrap}>
        <Image
          source={require('../../assets/images/home-hero-banner.jpg')}
          style={styles.heroImg}
          resizeMode="contain"
        />
        <Pressable
          accessibilityLabel="Katalogga o‘tish"
          onPress={() => router.push('/(tabs)/catalog')}
          style={styles.heroHit}
        />
      </View>

      {/* 5 QUICK ACTIONS */}
      <View style={styles.quickRow}>
        {QUICK.map((item) => (
          <Pressable key={item.label} onPress={() => router.push(item.to as any)} style={styles.quickItem}>
            <View style={[styles.quickIcon, { backgroundColor: item.bg }]}>
              <MaterialCommunityIcons name={item.icon} size={22} color={PURPLE} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={2}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* BALANCE + NEAREST */}
      <View style={styles.twoCol}>
        <View style={styles.card}>
          <Text style={styles.cardLabel} numberOfLines={1}>
            {t('balance')}
          </Text>
          <Text style={styles.balance} numberOfLines={1}>
            {formatUzs(balance)}
          </Text>
          <View style={styles.tierRow}>
            <MaterialCommunityIcons name="medal-outline" size={14} color="#C9A227" />
            <Text style={styles.tier} numberOfLines={1}>
              {user.tier} daraja
            </Text>
          </View>
          {nextTierTarget != null ? (
            <ProgressLine progress={tierProgress} />
          ) : null}
          <Text style={styles.progressCaption} numberOfLines={2}>
            {String(user?.tier || '').toLowerCase().includes('plat')
              ? 'Eng yuqori daraja'
              : left != null
                ? `${t('nextLevel')}: ${formatUzs(left)} (xaridlar)`
                : 'Keyingi daraja chegarasi serverdan'}
          </Text>
          <Pressable onPress={() => router.push('/qr')} style={styles.cashbackBtn} accessibilityLabel="Mening QR kodim">
            <MaterialCommunityIcons name="qrcode" size={14} color="#fff" />
            <Text style={styles.cashbackBtnText} numberOfLines={1}>
              {t('spend')}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/cashback')} style={styles.historyBtn}>
            <Text style={styles.historyBtnText} numberOfLines={1}>
              {t('history')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel} numberOfLines={1}>
            {nearestLocated ? t('nearby') : 'Filial'}
          </Text>
          <View style={styles.nearPhotoWrap}>
            <Image
              source={require('../../assets/images/home-near-photo.jpg')}
              style={styles.nearPhoto}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.nearName} numberOfLines={2}>
            {nearest ? `VAKSINA MED — ${shortBranch(nearest.name)}` : 'Filiallar'}
          </Text>
          <View style={styles.openRow}>
            {nearest?.hours ? <View style={styles.openDot} /> : <View style={[styles.openDot, { backgroundColor: '#CBD5E1' }]} />}
            <Text style={styles.openText} numberOfLines={1}>
              {nearest?.hours
                ? String(nearest.hours).includes('24')
                  ? 'Ochiq · 24/7'
                  : String(nearest.hours)
                : 'Ish vaqti noma’lum'}
            </Text>
          </View>
          {nearestLocated && nearest?.distanceKm != null ? (
            <Text style={styles.nearMeta} numberOfLines={1}>
              {nearest.distanceKm} km · yaqin
            </Text>
          ) : (
            <Text style={styles.nearMeta} numberOfLines={1}>
              {nearest?.address || 'Filiallar ro‘yxatini oching'}
            </Text>
          )}
          <Pressable onPress={() => router.push('/branches')} style={styles.routeBtn}>
            <Text style={styles.routeBtnText} numberOfLines={1}>
              Filiallarni ko‘rish →
            </Text>
          </Pressable>
        </View>
      </View>

      {/* RECOMMENDATIONS */}
      <View style={styles.sectionRow}>
        <Text style={styles.section}>Siz uchun tavsiyalar</Text>
        <Pressable onPress={() => router.push('/(tabs)/catalog')}>
          <Text style={styles.link}>Barchasini ko‘rish →</Text>
        </Pressable>
      </View>

      {productsLoading ? (
        <View style={styles.productsState}>
          <ActivityIndicator color={PURPLE} />
          <Text style={styles.productsStateText}>Mahsulotlar yuklanmoqda...</Text>
        </View>
      ) : productsError ? (
        <View style={styles.productsState}>
          <MaterialCommunityIcons name="cloud-off-outline" size={36} color="#94A3B8" />
          <Text style={styles.productsStateTitle}>Mahsulotlarni yuklab bo‘lmadi</Text>
          <Text style={styles.productsStateText}>Internet aloqasini tekshiring va qayta urinib ko‘ring</Text>
          <Pressable style={styles.retryBtn} onPress={loadProducts}>
            <Text style={styles.retryBtnText}>Qayta urinish</Text>
          </Pressable>
        </View>
      ) : displayProducts.length === 0 ? (
        <View style={styles.productsState}>
          <MaterialCommunityIcons name="package-variant" size={36} color="#94A3B8" />
          <Text style={styles.productsStateTitle}>Hozircha tavsiyalar yo‘q</Text>
          <Text style={styles.productsStateText}>Katalogdan mahsulotlarni ko‘rib chiqing</Text>
          <Pressable style={styles.retryBtn} onPress={() => router.push('/(tabs)/catalog')}>
            <Text style={styles.retryBtnText}>Katalogga o‘tish</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productsRow}>
          {displayProducts.map((p) => (
            <Pressable
              key={String(p.id)}
              style={styles.productCard}
              onPress={() => router.push(`/product/${p.id}` as any)}
            >
              <View style={styles.productImgWrap}>
                {p.imageUrl ? (
                  <Image source={{ uri: p.imageUrl }} style={styles.productImg} resizeMode="contain" />
                ) : (
                  <MaterialCommunityIcons name="pill" size={36} color={PURPLE} />
                )}
              </View>
              <Text style={styles.productName} numberOfLines={2}>
                {p.name}
              </Text>
              <View style={styles.productBottom}>
                <Text style={styles.productPrice}>{formatUzs(p.price)}</Text>
                <Pressable style={styles.addBtn} onPress={() => void api.addToCart(Number(p.id), 1)}>
                  <Feather name="shopping-cart" size={12} color="#fff" />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerLogo: { width: 46, height: 46 },
  brandLine: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  brandVaksina: { color: PURPLE },
  brandMed: { color: YELLOW },
  brandSlogan: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 6.5,
    letterSpacing: 0.15,
    color: PURPLE,
    opacity: 0.8,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EEEAF5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2A104E',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: YELLOW,
  },

  greet: { fontFamily: 'Inter_700Bold', fontSize: 22, color: PURPLE_DEEP },
  greetSub: {
    marginTop: 4,
    marginBottom: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748B',
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EEEAF5',
    marginBottom: 14,
    shadowColor: '#2A104E',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: PURPLE_DEEP,
    outlineStyle: 'none' as any,
  },

  heroWrap: {
    width: '100%',
    aspectRatio: 2.485,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#EEF0F8',
    position: 'relative',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  heroHit: {
    position: 'absolute',
    left: '5%',
    bottom: '7%',
    width: '42%',
    height: '24%',
    borderRadius: 14,
  },

  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 4,
  },
  quickItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  quickIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: PURPLE_DEEP,
    textAlign: 'center',
    lineHeight: 12,
  },

  twoCol: { flexDirection: 'row', gap: 10, marginBottom: 6, width: '100%' },
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEEAF5',
    shadowColor: '#2A104E',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#64748B' },
  balance: { fontFamily: 'Inter_700Bold', fontSize: 18, color: PURPLE_DEEP, marginTop: 4 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginBottom: 6 },
  tier: { fontFamily: 'Inter_700Bold', fontSize: 10, color: PURPLE_DEEP, flexShrink: 1 },
  progressCaption: { fontFamily: 'Inter_400Regular', fontSize: 9, color: '#64748B', marginTop: 6 },
  cashbackBtn: {
    marginTop: 10,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  cashbackBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 10 },
  historyBtn: {
    marginTop: 6,
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#F3EAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtnText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: PURPLE },

  nearPhotoWrap: {
    marginTop: 8,
    width: '100%',
    aspectRatio: 2.6875,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#1a0a2e',
    overflow: 'hidden',
  },
  nearPhoto: {
    width: '100%',
    height: '100%',
  },
  nearName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: PURPLE_DEEP,
    lineHeight: 15,
  },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E', flexShrink: 0 },
  openText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#16A34A', flexShrink: 1 },
  nearMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: '#64748B', marginTop: 4 },
  routeBtn: {
    marginTop: 10,
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#F3EAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  routeBtnText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: PURPLE },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 12,
  },
  section: { fontFamily: 'Inter_700Bold', fontSize: 17, color: PURPLE_DEEP },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: PURPLE },

  productsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 28,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEEAF5',
    gap: 8,
  },
  productsStateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  productsStateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },

  productsRow: { gap: 12, paddingBottom: 28 },
  productCard: {
    width: 148,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEEAF5',
  },
  productImgWrap: {
    height: 100,
    borderRadius: 14,
    backgroundColor: '#F8F5FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  productImg: { width: '100%', height: '100%' },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE_DEEP,
    lineHeight: 16,
    minHeight: 32,
  },
  productBottom: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productPrice: { fontFamily: 'Inter_700Bold', fontSize: 13, color: PURPLE },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
