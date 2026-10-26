import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { Screen } from '@/components/AppUI';
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
  icon: 'pill' | 'line-scan' | 'alarm' | 'map-marker-outline';
  labelKey: TranslationKey;
  to: string;
  clearQ?: boolean;
  bg: string;
  iconColor: string;
  badge?: string;
}[] = [
  { icon: 'pill', labelKey: 'home.quickSearch', to: '/(tabs)/catalog', clearQ: true, bg: '#EDE9FE', iconColor: '#7C3AED' },
  { icon: 'line-scan', labelKey: 'home.quickPrescription', to: '/prescription', bg: '#EEF2FF', iconColor: '#4F46E5', badge: 'AI' },
  { icon: 'alarm', labelKey: 'reminders.quickActionReminders', to: '/reminders', bg: '#FFE4E6', iconColor: '#E11D48' },
  { icon: 'map-marker-outline', labelKey: 'common.navBranches', to: '/branches', bg: '#D1FAE5', iconColor: '#059669' },
];

const HERO_BASE_IMAGE = require('../../assets/images/home-hero-clean-base.png');

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
  const { t, fmt, language, user, cartCount, refresh } = useApp();
  const { width: windowW } = useWindowDimensions();
  const contentW = Math.max(280, Math.round(windowW - SCREEN_PAD * 2));
  const colGap = contentW < 340 ? 8 : 12;
  const gridCardW = Math.floor((contentW - colGap) / 2);

  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterKey>('all');
  const [query, setQuery] = useState('');
  const heroHeight = Math.max(140, Math.round(contentW / HERO_AR));

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError(false);
    void api
      .products('?limit=24&offset=0')
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
    loadProducts();
  }, [loadProducts]);

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
        setAddedIds((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => {
          setAddedIds((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 1600);
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
      {/* HEADER — Clean Brand Logo + Actions */}
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

      {/* GREETING */}
      <View style={styles.greetWrap}>
        <Text style={styles.greet} numberOfLines={1}>
          {t('home.greeting', { name: user.name?.trim() || t('home.guestName') })}
        </Text>
        <Text style={styles.greetSub}>{t('home.greetingSubtitle')}</Text>
      </View>

      {/* SEARCH BOX */}
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

      {/* HERO 3D BANNER — Apple Store widescreen artwork with crisp vector typography */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.heroA11y')}
        onPress={() => router.push({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
        style={({ pressed }) => [styles.heroWrap, { height: heroHeight }, pressed && styles.pressed]}
      >
        <Image
          source={HERO_BASE_IMAGE}
          style={styles.heroImg}
          resizeMode="cover"
          fadeDuration={0}
        />
        <View style={styles.heroTextOverlay} pointerEvents="none">
          <Text
            style={[
              styles.heroSloganText,
              {
                fontSize: Math.min(19, Math.max(14, Math.round(contentW * 0.046))),
                lineHeight: Math.min(25, Math.max(18, Math.round(contentW * 0.058))),
              },
            ]}
          >
            {t('home.heroSlogan')}
          </Text>
        </View>
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
              <MaterialCommunityIcons name={item.icon} size={24} color={item.iconColor} />
              {item.badge ? (
                <View style={styles.quickBadge}>
                  {/* i18n-ignore */}
                  <Text style={styles.quickBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.quickLabel} numberOfLines={2}>
              {t(item.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* FEATURED PRODUCTS (Directly below Quick Actions) */}
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
        <View style={styles.productsGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={`skel-${i}`} style={[styles.gridCard, styles.productSkeleton, { width: gridCardW }]}>
              <View style={styles.gridImgWrap}>
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
        </View>
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
        <View style={styles.productsGrid}>
          {displayProducts.map((p) => {
            const isAdded = Boolean(addedIds[String(p.id)]);
            return (
              <View key={`prod-${p.id}`} style={[styles.gridCard, { width: gridCardW }]}>
                <Pressable
                  style={({ pressed }) => [styles.productCardMain, pressed && styles.pressed]}
                  onPress={() => router.push(`/product/${p.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.productA11y', { name: p.name, price: fmt.money(p.price) })}
                >
                  <View style={styles.gridImgWrap}>
                    <View style={styles.cashbackBadge}>
                      <Text style={styles.cashbackBadgeText}>{t('home.cashbackBadge')}</Text>
                    </View>
                    <View style={styles.ratingBadge}>
                      <MaterialCommunityIcons name="star" size={11} color="#F59E0B" />
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
                      <MaterialCommunityIcons name={productIconName(p.icon)} size={40} color={PURPLE} />
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
                      isAdded && styles.addBtnSuccess,
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
                    ) : isAdded ? (
                      <Feather name="check" size={16} color="#fff" />
                    ) : (
                      <Feather name="plus" size={16} color="#fff" />
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    minHeight: 44,
  },
  headerLogo: { width: 42, height: 42 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F3EEFF',
    borderWidth: 1,
    borderColor: '#ECE7F6',
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

  greetWrap: {
    marginBottom: 14,
  },
  greet: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 30,
    color: PURPLE_DEEP,
    letterSpacing: -0.3,
  },
  greetSub: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 19,
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
    borderColor: '#ECE7F6',
    marginBottom: SPACE,
    shadowColor: '#1A1040',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
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
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: SPACE,
    backgroundColor: '#F3EEFF',
    borderWidth: 1,
    borderColor: '#ECE7F6',
    shadowColor: '#5414B8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    position: 'relative',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  heroTextOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 18,
    width: '52%',
    justifyContent: 'center',
  },
  heroSloganText: {
    fontFamily: 'Inter_700Bold',
    color: '#160430',
    letterSpacing: -0.3,
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
  quickBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  quickBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8.5,
    lineHeight: 10,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    includeFontPadding: false,
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
    height: 142,
    borderRadius: 16,
    backgroundColor: '#F8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#ECE7F6',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  cashbackBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
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
  rxBanner: {
    backgroundColor: '#FAF5FF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rxBannerLeft: {
    flex: 1,
    paddingRight: 10,
  },
  rxBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  rxBadge: {
    backgroundColor: PURPLE,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rxBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  rxTag: {
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rxTagText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: PURPLE,
  },
  rxBannerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
    marginBottom: 3,
  },
  rxBannerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 15,
    color: '#6B7280',
  },
  rxBannerRight: {
    alignItems: 'center',
    gap: 4,
  },
  rxCameraBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  rxActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: PURPLE,
  },
  ambientGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#EDE9FE',
    opacity: 0.6,
  },
  addBtnSuccess: {
    backgroundColor: '#10B981',
  },

  // Native sleek prescription scanner banner
  rxScannerBanner: {
    backgroundColor: '#F5F0FF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E4D7F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: SPACE + 4,
    ...Platform.select({
      ios: { shadowColor: PURPLE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 10px rgba(106, 34, 214, 0.06)' },
    }),
  },
  rxScannerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxScannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  rxScannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  rxScannerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  rxAiMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    gap: 2,
  },
  rxAiMiniBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    lineHeight: 12,
    color: '#D97706',
  },
  rxScannerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
  },
  rxScannerCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 5,
  },
  rxScannerCtaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: PURPLE,
  },

  // 2-Column Product Grid
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  gridCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECEAF2',
    ...Platform.select({
      ios: { shadowColor: '#1A1040', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
      web: { boxShadow: '0 3px 10px rgba(26, 16, 64, 0.04)' },
    }),
    marginBottom: 2,
  },
  gridImgWrap: {
    height: 126,
    borderRadius: 14,
    backgroundColor: '#F8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#ECE7F6',
  },
});
