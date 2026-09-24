import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useApp } from '@/context/AppContext';
import { ProgressLine, Screen, formatUzs } from '@/components/AppUI';
import { api } from '@/lib/api';

const PURPLE = '#5C328E';
const PURPLE_DEEP = '#2A104E';
const YELLOW = '#FFCC00';
const MUTED = '#64748B';
const BORDER = '#E8E4F0';
const CARD_BG = '#FFFFFF';

/** Approved user banner: home-hero-final.png (1825×862). Full visual — no text overlay. */
const HERO_AR = 1825 / 862;
const SCREEN_PAD = 20;
/** Vertical rhythm between major Home sections */
const SPACE = 16;

function toast(title: string, msg: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

function shortBranch(name?: string) {
  return String(name || '').replace(/^Vaksina Med\s*[·•]\s*/i, '').trim() || 'Filial';
}

function productIconName(icon?: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const key = String(icon || 'pill');
  return (key in MaterialCommunityIcons.glyphMap ? key : 'pill') as React.ComponentProps<
    typeof MaterialCommunityIcons
  >['name'];
}

/** Hours display only — never claims live open/closed without a schedule engine. */
function branchHoursLabel(branch: { hours?: string; is24h?: boolean } | null): string {
  if (!branch) return 'Ish vaqti noma’lum';
  if (branch.is24h) return '24/7';
  const hours = String(branch.hours || '').trim();
  if (!hours) return 'Ish vaqti noma’lum';
  if (/24\s*[\/·\-]\s*7|24\s*soat|круглосуточ/i.test(hours)) return '24/7';
  return hours;
}

const QUICK = [
  { icon: 'pill' as const, label: 'Dori qidirish', to: '/(tabs)/catalog', clearQ: true, bg: '#FFF4CC' },
  { icon: 'map-marker-outline' as const, label: 'Dorixonalar', to: '/branches', bg: '#F3EAFB' },
  { icon: 'qrcode-scan' as const, label: 'Mening QR kodim', to: '/qr', bg: '#F3EAFB' },
  { icon: 'truck-delivery-outline' as const, label: 'Yetkazib berish', to: '/cart', bg: '#F3EAFB' },
];

export default function HomeScreen() {
  const { t, balance, user, cartCount, refresh } = useApp();
  const { width: windowW } = useWindowDimensions();
  const contentW = Math.max(280, Math.round(windowW - SCREEN_PAD * 2));
  const productCardW = Math.min(168, Math.max(148, Math.round((contentW - 12) / 2.2)));
  const colGap = contentW < 340 ? 8 : 12;

  const [nearest, setNearest] = useState<any>(null);
  const [nearestLocated, setNearestLocated] = useState(false);
  const [nearestLoading, setNearestLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [nextTierTarget, setNextTierTarget] = useState<number | null>(null);
  const [heroBoxW, setHeroBoxW] = useState(0);

  const spentTowardTier = Number(user?.total || 0);
  const left =
    nextTierTarget != null ? Math.max(0, nextTierTarget - spentTowardTier) : null;
  const tierProgress =
    nextTierTarget != null
      ? Math.min(1, Math.max(0, spentTowardTier / Math.max(1, nextTierTarget)))
      : 0;

  const heroSize = useMemo(() => {
    const w = heroBoxW > 0 ? heroBoxW : contentW;
    return { w, h: Math.max(1, Math.round(w / HERO_AR)) };
  }, [heroBoxW, contentW]);

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
    setNearestLoading(true);
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
    })().finally(() => setNearestLoading(false));
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
    router.push({ pathname: '/(tabs)/catalog', params: { q: q || '' } } as any);
  };

  const addToCart = useCallback(
    async (productId: number, productName?: string) => {
      const key = String(productId);
      if (addingId) return;
      setAddingId(key);
      try {
        await api.addToCart(productId, 1);
        await refresh();
        toast('Savat', `${productName || 'Mahsulot'} qo‘shildi`);
      } catch (e) {
        // Badge unchanged — refresh only ran on success above.
        toast('Xatolik', e instanceof Error ? e.message : 'Savatga qo‘shilmadi');
      } finally {
        setAddingId(null);
      }
    },
    [addingId, refresh],
  );

  const displayProducts = products.map((p) => ({
    id: p.id,
    name: String(p.nameUz || p.nameRu || ''),
    price: Number(p.price || 0),
    icon: String(p.icon || 'pill'),
    manufacturer: String(p.manufacturer || ''),
  }));

  return (
    <Screen>
      {/* HEADER — mark only */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/vaksina-mark-clean.png')}
          style={styles.headerLogo}
          resizeMode="contain"
          fadeDuration={0}
          accessibilityLabel="Vaksina Med"
        />
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            onPress={() => router.push('/notifications')}
            accessibilityLabel="Bildirishnomalar"
            hitSlop={4}
          >
            <Feather name="bell" size={20} color={PURPLE_DEEP} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            onPress={() => router.push('/cart')}
            accessibilityLabel="Savat"
            hitSlop={4}
          >
            <Feather name="shopping-cart" size={20} color={PURPLE_DEEP} />
            {cartCount > 0 ? <View style={styles.cartDot} /> : null}
          </Pressable>
        </View>
      </View>

      <Text style={styles.greet} numberOfLines={1}>
        Salom, {user.name?.trim() || 'mehmon'} 👋
      </Text>
      <Text style={styles.greetSub}>Bugun sizga nima kerak?</Text>

      {/* SEARCH */}
      <View style={styles.searchBox}>
        <Feather name="search" size={20} color="#94A3B8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Dori yoki mahsulot qidirish..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={onSearch}
          underlineColorAndroid="transparent"
          accessibilityLabel="Dori yoki mahsulot qidirish"
        />
        <Pressable
          onPress={() => router.push('/qr')}
          hitSlop={10}
          accessibilityLabel="Mening QR kodim"
          style={({ pressed }) => [styles.searchQrBtn, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="qrcode" size={22} color={PURPLE} />
        </Pressable>
      </View>

      {/* HERO — approved full banner; entire card opens Catalog (no overlay text/CTA) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Vaksina Med — Sog‘liqni asrab hayot zavqini ulashamiz. Katalogga o‘tish."
        onPress={() => router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
        style={({ pressed }) => [styles.heroWrap, { height: heroSize.h }, pressed && styles.pressed]}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== heroBoxW) setHeroBoxW(w);
        }}
      >
        {heroBoxW > 0 ? (
          <Image
            source={require('../../assets/images/home-hero-final.png')}
            style={{ width: heroSize.w, height: heroSize.h }}
            resizeMode="contain"
            fadeDuration={0}
            resizeMethod={Platform.OS === 'android' ? 'resize' : undefined}
          />
        ) : null}
      </Pressable>

      {/* QUICK ACTIONS */}
      <View style={styles.quickRow}>
        {QUICK.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => {
              if ('clearQ' in item && item.clearQ) {
                router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any);
                return;
              }
              router.push(item.to as any);
            }}
            style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={
              item.to === '/cart'
                ? 'Yetkazib berish — avval savatni ochish'
                : item.label
            }
          >
            <View style={[styles.quickIcon, { backgroundColor: item.bg }]}>
              <MaterialCommunityIcons name={item.icon} size={24} color={PURPLE} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={2}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* BALANCE + NEAREST */}
      <View style={[styles.twoCol, { gap: colGap }]}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('balance')}</Text>
          <Text style={styles.balance} adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1}>
            {formatUzs(balance)}
          </Text>
          <View style={styles.tierRow}>
            <MaterialCommunityIcons name="medal-outline" size={15} color="#C9A227" />
            <Text style={styles.tier}>
              {String(user.tier || '').trim() ? `${user.tier} daraja` : 'Daraja mavjud emas'}
            </Text>
          </View>
          {nextTierTarget != null ? (
            <View style={styles.progressWrap}>
              <ProgressLine progress={tierProgress} />
            </View>
          ) : null}
          <Text style={styles.progressCaption}>
            {String(user?.tier || '').toLowerCase().includes('plat')
              ? 'Eng yuqori daraja'
              : left != null
                ? `${t('nextLevel')}: ${formatUzs(left)} (xaridlar)`
                : 'Keyingi daraja chegarasi serverdan'}
          </Text>
          <View style={styles.cardFooter}>
            <Pressable
              onPress={() => router.push('/checkout')}
              style={({ pressed }) => [styles.primaryCardBtn, pressed && styles.pressed]}
              accessibilityLabel="Cashback ishlatish — buyurtma"
            >
              <Text style={styles.primaryCardBtnText}>{t('spend')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/cashback')}
              style={({ pressed }) => [styles.secondaryCardBtn, pressed && styles.pressed]}
              accessibilityLabel={t('history')}
            >
              <Text style={styles.secondaryCardBtnText}>{t('history')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {nearestLoading ? 'Filial' : nearestLocated ? t('nearby') : 'Filial'}
          </Text>
          <View
            style={styles.nearPhotoWrap}
            accessibilityLabel="Dorixona umumiy ko‘rinishi — aniq filial fotosurati emas"
          >
            <Image
              source={require('../../assets/images/home-near-photo.jpg')}
              style={styles.nearPhoto}
              resizeMode="cover"
              fadeDuration={0}
              resizeMethod={Platform.OS === 'android' ? 'resize' : undefined}
            />
            <View style={styles.nearPhotoCaption} pointerEvents="none">
              <Text style={styles.nearPhotoCaptionText}>Umumiy ko‘rinish</Text>
            </View>
          </View>
          {nearestLoading ? (
            <View style={styles.nearLoadingRow}>
              <ActivityIndicator size="small" color={PURPLE} />
              <Text style={styles.nearMeta}>Filial yuklanmoqda...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.nearName} numberOfLines={2}>
                {nearest ? `VAKSINA MED — ${shortBranch(nearest.name)}` : 'Filiallar'}
              </Text>
              <View style={styles.openRow}>
                <View style={[styles.hoursDot, !nearest && { backgroundColor: '#CBD5E1' }]} />
                <Text style={styles.hoursText} numberOfLines={1}>
                  {branchHoursLabel(nearest)}
                </Text>
              </View>
              {nearestLocated && nearest?.distanceKm != null ? (
                <Text style={styles.nearMeta} numberOfLines={1}>
                  {nearest.distanceKm} km · yaqin
                </Text>
              ) : nearest?.address ? (
                <Text style={styles.nearMeta} numberOfLines={2}>
                  {nearest.address}
                </Text>
              ) : (
                <Text style={styles.nearMeta} numberOfLines={2}>
                  Filiallar ro‘yxatini oching
                </Text>
              )}
              {!nearestLocated && nearest ? (
                <Text style={styles.nearDisclaimer} numberOfLines={2}>
                  Masofa faqat joylashuv ruxsati berilganda ko‘rsatiladi.
                </Text>
              ) : null}
            </>
          )}
          <View style={styles.cardFooter}>
            <Pressable
              onPress={() => router.push('/branches')}
              style={({ pressed }) => [styles.secondaryCardBtn, pressed && styles.pressed]}
              accessibilityLabel="Filiallarni ko‘rish"
            >
              <Text style={styles.secondaryCardBtnText}>Filiallarni ko‘rish →</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section} numberOfLines={1}>
          Tanlangan mahsulotlar
        </Text>
        <Pressable
          onPress={() => router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
          hitSlop={8}
        >
          <Text style={styles.link}>Barchasini ko‘rish →</Text>
        </Pressable>
      </View>

      {productsLoading ? (
        <ScrollView
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsRow}
        >
          {[0, 1, 2].map((i) => (
            <View key={`skel-${i}`} style={[styles.productCard, styles.productSkeleton, { width: productCardW }]}>
              <View style={styles.productImgWrap}>
                <ActivityIndicator size="small" color={PURPLE} />
              </View>
              <View style={styles.skelLineWide} />
              <View style={styles.skelLineNarrow} />
              <View style={styles.productBottom}>
                <View style={styles.skelPrice} />
                <View style={styles.skelAdd} />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : productsError ? (
        <View style={styles.productsState}>
          <MaterialCommunityIcons name="cloud-off-outline" size={32} color="#94A3B8" />
          <Text style={styles.productsStateTitle}>Mahsulotlarni yuklab bo‘lmadi</Text>
          <Pressable style={styles.retryBtn} onPress={loadProducts}>
            <Text style={styles.retryBtnText}>Qayta urinish</Text>
          </Pressable>
        </View>
      ) : displayProducts.length === 0 ? (
        <View style={styles.productsState}>
          <MaterialCommunityIcons name="package-variant" size={32} color="#94A3B8" />
          <Text style={styles.productsStateTitle}>Hozircha mahsulotlar yo‘q</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
          >
            <Text style={styles.retryBtnText}>Katalogni ko‘rish</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={productCardW + 12}
          snapToAlignment="start"
          contentContainerStyle={styles.productsRow}
        >
          {displayProducts.map((p) => (
            <View key={String(p.id)} style={[styles.productCard, { width: productCardW }]}>
              <Pressable
                style={({ pressed }) => [styles.productCardMain, pressed && styles.pressed]}
                onPress={() => router.push(`/product/${p.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${formatUzs(p.price)}`}
              >
                <View style={styles.productImgWrap}>
                  <MaterialCommunityIcons name={productIconName(p.icon)} size={44} color={PURPLE} />
                </View>
                <Text style={styles.productName} numberOfLines={2}>
                  {p.name}
                </Text>
                {p.manufacturer ? (
                  <Text style={styles.productMeta} numberOfLines={1}>
                    {p.manufacturer}
                  </Text>
                ) : null}
              </Pressable>
              <View style={styles.productBottom}>
                <Pressable
                  style={styles.productPriceHit}
                  onPress={() => router.push(`/product/${p.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${formatUzs(p.price)}`}
                >
                  <Text style={styles.productPrice} numberOfLines={1}>
                    {formatUzs(p.price)}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.addBtn, addingId === String(p.id) ? { opacity: 0.55 } : null]}
                  disabled={addingId != null}
                  onPress={() => void addToCart(Number(p.id), p.name)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name} ni savatga qo‘shish`}
                >
                  {addingId === String(p.id) ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="plus" size={16} color="#fff" />
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {/* Clearance above floating tab bar */}
      <View style={styles.bottomClearance} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 44,
  },
  headerLogo: { width: 40, height: 40 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: YELLOW,
  },

  greet: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 30,
    color: PURPLE_DEEP,
    letterSpacing: -0.2,
    marginTop: 0,
  },
  greetSub: {
    marginTop: 4,
    marginBottom: SPACE,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 20,
    color: MUTED,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: SPACE,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
    paddingVertical: 0,
    outlineStyle: 'none' as any,
  },
  searchQrBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F5FC',
  },

  heroWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: SPACE,
    backgroundColor: '#F4F0FA',
  },

  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE,
    gap: 4,
  },
  quickItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    minHeight: 88,
  },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },

  twoCol: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 0,
    width: '100%',
  },
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  balance: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 28,
    color: PURPLE_DEEP,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  tier: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: '#5B4B72',
    flexShrink: 1,
  },
  progressWrap: {
    marginTop: 10,
  },
  progressCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
    marginTop: 8,
  },
  cardFooter: {
    marginTop: 'auto' as unknown as number,
    paddingTop: 12,
    gap: 8,
  },
  primaryCardBtn: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  primaryCardBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  secondaryCardBtn: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: '#F3EAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 9,
  },
  secondaryCardBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: PURPLE,
    textAlign: 'center',
  },

  nearPhotoWrap: {
    marginTop: 10,
    width: '100%',
    aspectRatio: 688 / 256,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#1a0a2e',
    overflow: 'hidden',
  },
  nearPhoto: {
    width: '100%',
    height: '100%',
  },
  nearPhotoCaption: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(26, 10, 46, 0.72)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  nearPhotoCaptionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
    color: '#FFFFFF',
  },
  nearName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: PURPLE_DEEP,
    minHeight: 36,
  },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  hoursDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#94A3B8', flexShrink: 0 },
  hoursText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    flexShrink: 1,
  },
  nearLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  nearMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
    marginTop: 4,
  },
  nearDisclaimer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
    color: MUTED,
    marginTop: 6,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE,
    marginBottom: 12,
    gap: 10,
  },
  section: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    lineHeight: 24,
    color: PURPLE_DEEP,
    flexShrink: 1,
  },
  link: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: PURPLE,
  },

  productsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  productsStateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 20,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  productsStateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6,
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },

  productsRow: { gap: 12, paddingRight: 4, paddingBottom: 4 },
  productCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  productCardMain: {
    minWidth: 0,
  },
  productSkeleton: {
    opacity: 0.72,
  },
  productImgWrap: {
    height: 96,
    borderRadius: 14,
    backgroundColor: '#F3ECFA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
    color: PURPLE_DEEP,
    minHeight: 34,
  },
  productMeta: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
  },
  productBottom: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  productPriceHit: {
    flex: 1,
    minWidth: 0,
  },
  productPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE,
    flexShrink: 1,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skelLineWide: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EDE7F5',
    width: '88%',
    marginBottom: 8,
  },
  skelLineNarrow: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EDE7F5',
    width: '55%',
  },
  skelPrice: {
    height: 14,
    width: 72,
    borderRadius: 6,
    backgroundColor: '#EDE7F5',
  },
  skelAdd: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EDE7F5',
  },
  bottomClearance: {
    height: Platform.OS === 'web' ? 48 : 68,
  },
});
