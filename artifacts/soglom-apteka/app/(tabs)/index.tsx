import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useApp } from '@/context/AppContext';
import { localizedName } from '@/lib/i18n/data';
import { ProgressLine, Screen } from '@/components/AppUI';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialogs';
import type { TFunction, TranslationKey } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const YELLOW = '#FFCC00';
const MUTED = '#8B93A7';
const BORDER = '#E9E6F0';
const CARD_BG = '#FFFFFF';
const LAVENDER = '#F1EBFF';

/** Approved user banner: home-hero-final.png (1825×862). Full visual — no text overlay. */
const HERO_AR = 1825 / 862;
const SCREEN_PAD = 20;
/** Vertical rhythm between major Home sections */
const SPACE = 12;


function productIconName(icon?: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const key = String(icon || 'pill');
  return (key in MaterialCommunityIcons.glyphMap ? key : 'pill') as React.ComponentProps<
    typeof MaterialCommunityIcons
  >['name'];
}

const QUICK: {
  icon: 'pill' | 'camera-outline' | 'alarm' | 'map-marker-outline';
  labelKey: TranslationKey;
  to: string;
  clearQ?: boolean;
  bg: string;
}[] = [
  { icon: 'pill', labelKey: 'home.quickSearch', to: '/(tabs)/catalog', clearQ: true, bg: '#FFF4CC' },
  { icon: 'camera-outline', labelKey: 'catalog.prescriptionScanAction', to: '/prescription', bg: '#EDE9FE' },
  { icon: 'alarm', labelKey: 'reminders.quickActionReminders', to: '/reminders', bg: '#FEE2E2' },
  { icon: 'map-marker-outline', labelKey: 'common.navBranches', to: '/branches', bg: LAVENDER },
];

const HERO_IMAGES: Record<string, any> = {
  uz: require('../../assets/images/home-hero-final-uz.png'),
  ru: require('../../assets/images/home-hero-clean-base.png'),
  en: require('../../assets/images/home-hero-clean-base.png'),
};

const PRODUCT_IMAGES: Record<string, any> = {
  'cat-p1': require('../../assets/images/cat-p1-d3.png'),
  'cat-p2': require('../../assets/images/cat-p2-c.png'),
  'cat-p3': require('../../assets/images/cat-p3-mg.png'),
  'cat-p4': require('../../assets/images/cat-p4-omega.png'),
  'cat-p5': require('../../assets/images/cat-p5-zn.png'),
  'cat-p6': require('../../assets/images/cat-p6-para.png'),
};

function getProductImage(item: { id?: number | string; nameUz?: string; nameRu?: string; analogGroup?: string; name?: string }) {
  const id = Number(item.id);
  if (id === 1) return PRODUCT_IMAGES['cat-p1'];
  if (id === 2) return PRODUCT_IMAGES['cat-p2'];
  if (id === 3) return PRODUCT_IMAGES['cat-p3'];
  if (id === 4) return PRODUCT_IMAGES['cat-p4'];
  if (id === 5) return PRODUCT_IMAGES['cat-p5'];
  if (id === 6 || id === 7 || id === 8) return PRODUCT_IMAGES['cat-p6'];

  const group = String(item.analogGroup || '').toLowerCase();
  if (group.includes('vitamin-d')) return PRODUCT_IMAGES['cat-p1'];
  if (group.includes('vitamin-c')) return PRODUCT_IMAGES['cat-p2'];
  if (group.includes('magnesium')) return PRODUCT_IMAGES['cat-p3'];
  if (group.includes('omega')) return PRODUCT_IMAGES['cat-p4'];
  if (group.includes('zinc')) return PRODUCT_IMAGES['cat-p5'];
  if (group.includes('analgesic')) return PRODUCT_IMAGES['cat-p6'];

  return null;
}

type CategoryFilterKey = 'all' | 'vitamins' | 'pain' | 'cold';

const CATEGORY_FILTERS: { key: CategoryFilterKey; labelKey: TranslationKey; icon: string }[] = [
  { key: 'all', labelKey: 'home.categoryAll', icon: 'view-grid-outline' },
  { key: 'vitamins', labelKey: 'home.categoryVitamins', icon: 'pill' },
  { key: 'pain', labelKey: 'home.categoryPain', icon: 'medical-bag' },
  { key: 'cold', labelKey: 'home.categoryCold', icon: 'weather-windy' },
];

export default function HomeScreen() {
  const { t, fmt, language, balance, user, cartCount, refresh } = useApp();
  const { width: windowW } = useWindowDimensions();
  const contentW = Math.max(280, Math.round(windowW - SCREEN_PAD * 2));
  const productCardW = Math.min(180, Math.max(168, Math.round((contentW - 12) / 2.05)));
  const colGap = contentW < 340 ? 8 : 12;

  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterKey>('all');
  const [query, setQuery] = useState('');
  const [nextTierTarget, setNextTierTarget] = useState<number | null>(null);
  const [heroBoxW, setHeroBoxW] = useState(0);
  const isOverlay = t('home.heroBannerType') === 'overlay';

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
      .products('?limit=16&offset=0')
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
        notify(t('common.navCart'), t('home.addedToCart', { name: productName || t('common.navProduct') }));
      } catch (e) {
        // Badge unchanged — refresh only ran on success above.
        notify(t('common.errorTitle'), localizeError(e, t, { fallback: 'home.addToCartFailed' }));
      } finally {
        setAddingId(null);
      }
    },
    [addingId, refresh, t],
  );

  const displayProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedCategory === 'all') return true;
        const cat = String(p.category || '').toLowerCase();
        const analog = String(p.analogGroup || '').toLowerCase();
        const name = (String(p.nameUz || '') + ' ' + String(p.nameRu || '')).toLowerCase();

        if (selectedCategory === 'vitamins') {
          return (
            cat.includes('vitamin') ||
            analog.includes('vitamin') ||
            analog.includes('magnesium') ||
            analog.includes('omega') ||
            analog.includes('zinc')
          );
        }
        if (selectedCategory === 'pain') {
          return (
            cat.includes('og') ||
            analog.includes('analgesic') ||
            name.includes('paratsetamol') ||
            name.includes('ibuprofen') ||
            name.includes('nurofen')
          );
        }
        if (selectedCategory === 'cold') {
          return (
            cat.includes('shamollash') ||
            cat.includes('allergiya') ||
            analog.includes('cough') ||
            analog.includes('allergy') ||
            name.includes('acc') ||
            name.includes('loratadin')
          );
        }
        return true;
      })
      .map((p) => {
        const rawName = localizedName(language, p);
        const cleanName = rawName.replace(/\s*\(Demo\)/gi, '').trim();
        const rawMan = String(p.manufacturer || '').trim();
        const cleanMan = rawMan.replace(/\s*\(Demo\)/gi, '').trim() || String(p.category || '').trim();
        return {
          id: p.id,
          name: cleanName,
          price: Number(p.price || 0),
          icon: String(p.icon || 'pill'),
          manufacturer: cleanMan,
          analogGroup: String(p.analogGroup || ''),
          image: getProductImage(p),
        };
      });
  }, [products, selectedCategory, language]);

  return (
    <Screen>
      {/* HEADER — Clean Logo + Actions */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/vaksina-mark-clean.png')}
          style={styles.headerLogo}
          resizeMode="contain"
          fadeDuration={0}
          accessibilityLabel={t('common.appName')}
        />

        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={t('common.navNotifications')}
            hitSlop={4}
          >
            <Feather name="bell" size={20} color={PURPLE_DEEP} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            onPress={() => router.push('/cart')}
            accessibilityRole="button"
            accessibilityLabel={
              cartCount > 0 ? t('home.cartWithCountA11y', { count: cartCount }) : t('common.navCart')
            }
            hitSlop={4}
          >
            <Feather name="shopping-cart" size={20} color={PURPLE_DEEP} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : String(cartCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <Text style={styles.greet} numberOfLines={1}>
        {t('home.greeting', { name: user.name?.trim() || t('home.guestName') })}
      </Text>
      <Text style={styles.greetSub}>{t('home.greetingSubtitle')}</Text>

      {/* SEARCH */}
      <View style={styles.searchBox}>
        <Feather name="search" size={20} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor={MUTED}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={onSearch}
          underlineColorAndroid="transparent"
          accessibilityLabel={t('home.searchA11y')}
        />
        <Pressable
          onPress={() => router.push('/qr')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.navMyQr')}
          style={({ pressed }) => [styles.searchQrBtn, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="qrcode" size={22} color={PURPLE} />
        </Pressable>
      </View>

      {/* HERO — approved full banner; entire card opens Catalog (no overlay text/CTA) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.heroA11y')}
        onPress={() => router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
        style={({ pressed }) => [styles.heroWrap, { height: heroSize.h }, pressed && styles.pressed]}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== heroBoxW) setHeroBoxW(w);
        }}
      >
        {heroBoxW > 0 ? (
          <>
            <Image
              source={HERO_IMAGES[language] || HERO_IMAGES.uz}
              style={{ width: heroSize.w, height: heroSize.h }}
              resizeMode="contain"
              fadeDuration={0}
              resizeMethod={Platform.OS === 'android' ? 'resize' : undefined}
            />
            {isOverlay ? (
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    paddingLeft: Math.round(heroSize.w * (117 / 1825)),
                    paddingTop: Math.round(heroSize.h * (235 / 862)),
                    width: Math.round(heroSize.w * 0.54),
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: 'Inter_700Bold',
                    fontWeight: '700',
                    color: '#1C025D',
                    fontSize: Math.max(14, Math.round(heroSize.w * 0.043)),
                    lineHeight: Math.max(18, Math.round(heroSize.w * 0.058)),
                    letterSpacing: -0.3,
                  }}
                >
                  {t('home.heroSlogan')}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </Pressable>

      {/* QUICK ACTIONS */}
      <View style={styles.quickRow}>
        {QUICK.map((item) => (
          <Pressable
            key={item.labelKey}
            onPress={() => {
              if (item.clearQ) {
                router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any);
                return;
              }
              router.push(item.to as any);
            }}
            style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t(item.labelKey)}
          >
            <View style={[styles.quickIcon, { backgroundColor: item.bg }]}>
              <MaterialCommunityIcons name={item.icon} size={24} color={PURPLE} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={2}>
              {t(item.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* VIP LOYALTY & CASHBACK CARD */}
      <View style={styles.loyaltyCardContainer}>
        <LinearGradient
          colors={['#5414B8', '#7325E6', '#320970']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.loyaltyGradient}
        >
          {/* Ambient Lighting Orbs for Glassmorphism Depth */}
          <View style={styles.loyaltyAmbientWarm} pointerEvents="none" />
          <View style={styles.loyaltyAmbientCool} pointerEvents="none" />

          {/* Top Row: Brand & Crown Tier Badge */}
          <View style={styles.loyaltyTopRow}>
            <View style={styles.loyaltyBrandBadge}>
              <View style={styles.sparkleWrap}>
                <MaterialCommunityIcons name="star-four-points" size={13} color="#FFD166" />
              </View>
              <Text style={styles.loyaltyBrandTitle}>{t('home.balanceLabel')}</Text>
            </View>

            <Pressable
              onPress={() => router.push('/bonuses')}
              style={styles.tierCapsule}
              accessibilityRole="button"
              accessibilityLabel={
                String(user.tier || '').trim()
                  ? t('home.tierName', { tier: String(user.tier).trim() })
                  : t('home.tierNone')
              }
            >
              <MaterialCommunityIcons name="crown" size={13} color="#FFD166" />
              <Text style={styles.tierCapsuleText} numberOfLines={1}>
                {String(user.tier || '').trim()
                  ? t('home.tierName', { tier: String(user.tier).trim() })
                  : t('home.tierNone')}
              </Text>
            </Pressable>
          </View>

          {/* Middle Row: Large Crisp Balance + Quick Cashier QR Button */}
          <View style={styles.loyaltyMainRow}>
            <View style={styles.loyaltyBalanceWrap}>
              <Text style={styles.loyaltyBalanceValue} numberOfLines={1}>
                {fmt.money(balance)}
              </Text>
              <Text style={styles.loyaltyBalanceSub}>{t('home.availableBonuses')}</Text>
            </View>

            <View style={styles.loyaltyActionsGroup}>
              {/* Instant QR for Cashier scanner */}
              <Pressable
                onPress={() => router.push('/qr')}
                style={({ pressed }) => [styles.loyaltyQrBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('home.qrCashier')}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={16} color="#FFFFFF" />
                <Text style={styles.loyaltyQrBtnText}>{t('home.qrCashier')}</Text>
              </Pressable>

              {/* History button */}
              <Pressable
                onPress={() => router.push('/cashback')}
                style={({ pressed }) => [styles.loyaltyHistoryBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('home.cashbackHistory')}
              >
                <Feather name="clock" size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {/* Bottom Progress Section: Next Tier Progress */}
          {nextTierTarget != null ? (
            <View style={styles.loyaltyProgressSection}>
              <View style={styles.loyaltyTrack}>
                <View
                  style={[
                    styles.loyaltyFill,
                    { width: `${Math.min(100, Math.max(0, Math.round(tierProgress * 100)))}%` },
                  ]}
                />
              </View>
              <View style={styles.loyaltyProgressLabelsRow}>
                <Text style={styles.loyaltyProgressText} numberOfLines={1}>
                  {String(user?.tier || '').toLowerCase().includes('plat')
                    ? t('home.tierTop')
                    : left != null
                      ? t('home.nextTierLeft', { amount: fmt.money(left) })
                      : t('home.nextTierUnknown')}
                </Text>
                <Pressable onPress={() => router.push('/cashback')}>
                  <Text style={styles.loyaltyHistoryLink}>{t('home.cashbackHistory')} →</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </LinearGradient>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section} numberOfLines={1}>
          {t('home.featuredProducts')}
        </Text>
        <Pressable
          onPress={() => router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
          hitSlop={8}
        >
          <Text style={styles.link}>{t('common.showAll')} →</Text>
        </Pressable>
      </View>

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryChipsRow}
      >
        {CATEGORY_FILTERS.map((cat) => {
          const active = selectedCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              style={({ pressed }) => [
                styles.categoryChip,
                active && styles.categoryChipActive,
                pressed && styles.pressed,
              ]}
              onPress={() => setSelectedCategory(cat.key)}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={cat.icon as any}
                size={15}
                color={active ? '#FFFFFF' : PURPLE}
              />
              <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                {t(cat.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
              <View style={styles.skelLineNarrow} />
              <View style={styles.skelLineWide} />
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
          <Text style={styles.productsStateTitle}>{t('home.productsLoadFailed')}</Text>
          <Pressable style={styles.retryBtn} onPress={loadProducts}>
            <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : displayProducts.length === 0 ? (
        <View style={styles.productsState}>
          <MaterialCommunityIcons name="package-variant" size={32} color="#94A3B8" />
          <Text style={styles.productsStateTitle}>{t('home.productsEmpty')}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => setSelectedCategory('all')}
          >
            <Text style={styles.retryBtnText}>{t('home.categoryAll')}</Text>
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
                accessibilityLabel={t('home.productA11y', { name: p.name, price: fmt.money(p.price) })}
              >
                <View style={styles.productImgWrap}>
                  <View style={styles.cashbackBadge}>
                    <Text style={styles.cashbackBadgeText}>{t('home.cashbackBadge')}</Text>
                  </View>
                  <View style={styles.ratingBadge}>
                    <Feather name="star" size={10} color="#D97706" />
                    {/* i18n-ignore */}
                    <Text style={styles.ratingBadgeText}>4.9</Text>
                  </View>
                  {p.image ? (
                    <Image
                      source={p.image}
                      style={styles.productImg}
                      resizeMode="contain"
                      fadeDuration={0}
                    />
                  ) : (
                    <MaterialCommunityIcons name={productIconName(p.icon)} size={44} color={PURPLE} />
                  )}
                </View>
                <Text style={styles.productMeta} numberOfLines={1}>
                  {p.manufacturer}
                </Text>
                <Text style={styles.productName} numberOfLines={2}>
                  {p.name}
                </Text>
              </Pressable>
              <View style={styles.productBottom}>
                <Pressable
                  style={styles.productPriceHit}
                  onPress={() => router.push(`/product/${p.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.productA11y', { name: p.name, price: fmt.money(p.price) })}
                >
                  <Text style={styles.productPrice} numberOfLines={1}>
                    {fmt.money(p.price)}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.addBtn,
                    addingId === String(p.id) ? { opacity: 0.55 } : null,
                    pressed && styles.pressed,
                  ]}
                  disabled={addingId != null}
                  onPress={() => void addToCart(Number(p.id), p.name)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.addToCartA11y', { name: p.name })}
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
  cartBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: CARD_BG,
  },
  cartBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    lineHeight: 12,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },

  greet: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    lineHeight: 32,
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
    gap: 6,
    paddingVertical: 3,
    minHeight: 82,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },

  loyaltyCardContainer: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#5414B8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: SPACE,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loyaltyGradient: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
    position: 'relative',
    overflow: 'hidden',
  },
  loyaltyAmbientWarm: {
    position: 'absolute',
    top: -35,
    right: -25,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 209, 102, 0.16)',
  },
  loyaltyAmbientCool: {
    position: 'absolute',
    bottom: -40,
    left: -20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
  },
  loyaltyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  loyaltyBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  sparkleWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 209, 102, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyBrandTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    lineHeight: 15,
    color: '#F5EEFF',
    letterSpacing: 0.2,
  },
  tierCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 209, 102, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.42)',
  },
  tierCapsuleText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    lineHeight: 15,
    color: '#FFD166',
  },
  loyaltyMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  loyaltyBalanceWrap: {
    flex: 1,
  },
  loyaltyBalanceValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    lineHeight: 30,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  loyaltyBalanceSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: 1,
  },
  loyaltyActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loyaltyQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  loyaltyQrBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  loyaltyHistoryBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loyaltyProgressSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
  },
  loyaltyTrack: {
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  loyaltyFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#FFD166',
  },
  loyaltyProgressLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  loyaltyProgressText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    flex: 1,
    marginRight: 8,
  },
  loyaltyHistoryLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
    color: '#FFD166',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
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

  categoryChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 1,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  categoryChipActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 2,
  },
  categoryChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },

  productsRow: { gap: 12, paddingRight: 4, paddingBottom: 6 },
  productCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECEAF2',
    shadowColor: '#1A1040',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardMain: {
    minWidth: 0,
  },
  productSkeleton: {
    opacity: 0.72,
  },
  productImgWrap: {
    height: 112,
    borderRadius: 14,
    backgroundColor: '#F8F6FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  productImg: {
    width: 92,
    height: 92,
  },
  cashbackBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 5.5,
    paddingVertical: 2.5,
    zIndex: 2,
  },
  cashbackBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 12,
    color: PURPLE,
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    zIndex: 2,
  },
  ratingBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 12,
    color: '#B45309',
  },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    lineHeight: 17,
    color: PURPLE_DEEP,
    minHeight: 34,
  },
  productMeta: {
    marginBottom: 3,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
  },
  productBottom: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  productPriceHit: {
    flex: 1,
    minWidth: 0,
  },
  productPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 18,
    color: PURPLE_DEEP,
    flexShrink: 1,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
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
