import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { localizedName } from '@/lib/i18n/data';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialogs';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F3F1F7';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const YELLOW = '#FFCC00';
const OK = '#3D7A55';
const BAD = '#B91C1C';

const PRODUCT_IMAGES: Record<string, any> = {
  'cat-p1': require('../../assets/images/cat-p1-d3.png'),
  'cat-p2': require('../../assets/images/cat-p2-c.png'),
  'cat-p3': require('../../assets/images/cat-p3-mg.png'),
  'cat-p4': require('../../assets/images/cat-p4-omega.png'),
  'cat-p5': require('../../assets/images/cat-p5-zn.png'),
  'cat-p6': require('../../assets/images/cat-p6-para.png'),
};

function getProductImage(item: { id?: number | string; analogGroup?: string; icon?: string } | null | undefined) {
  if (!item) return null;
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

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\s*\(Demo\)/gi, '')
    .replace(/\[TEST\s*\/\s*DEMO\]\s*/gi, '')
    .replace(/\s*Ushbu ma'lumot staging sinov muhiti uchun demo hisoblanadi\.?\s*Haqiqiy dori narxi va zaxirasi emas\.?/gi, '')
    .trim();
}

type BranchMeta = {
  id: number | null;
  name: string | null;
  address: string | null;
};

type StockUi =
  | { kind: 'no_branch' }
  | { kind: 'available'; qty: number }
  | { kind: 'unavailable' };

function resolveStock(data: {
  availabilityScoped?: boolean;
  selectedBranchId?: number | null;
  availableQuantity?: number | null;
}): StockUi {
  const scoped = Boolean(data.availabilityScoped) && data.selectedBranchId != null;
  if (!scoped) return { kind: 'no_branch' };
  const qty = Math.max(0, Number(data.availableQuantity) || 0);
  if (qty > 0) return { kind: 'available', qty };
  return { kind: 'unavailable' };
}

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.skel, style]} />;
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { refresh, cartCount, t, fmt, language } = useApp();
  const narrow = width < 380;
  const contentWidth = Math.min(width, 480);

  const [data, setData] = useState<any>(null);
  const [branchMeta, setBranchMeta] = useState<BranchMeta>({ id: null, name: null, address: null });
  const [loading, setLoading] = useState(true);
  /** Raw load error; localized at render so the message follows language changes. */
  const [error, setError] = useState<unknown>(null);
  const [notFound, setNotFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const [qty, setQty] = useState(1);

  const loadGen = useRef(0);
  const addingLock = useRef(false);
  const dataRef = useRef<any>(null);
  const branchIdRef = useRef<number | null>(null);
  const productKeyRef = useRef<string>('');

  dataRef.current = data;

  const load = useCallback(async (force = false) => {
    const productId = Number(id);
    const productKey = String(id ?? '');
    if (!Number.isInteger(productId) || productId <= 0) {
      setData(null);
      setError({ status: 404 });
      setNotFound(true);
      setLoading(false);
      return;
    }

    const gen = ++loadGen.current;

    let branchId: number | null = null;
    let name: string | null = null;
    let address: string | null = null;
    try {
      const cart = await api.cart();
      if (gen !== loadGen.current) return;
      const raw = cart?.branch?.id ?? cart?.cart?.branchId;
      if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) {
        branchId = Number(raw);
      }
      if (cart?.branch) {
        name = cart.branch.name != null ? String(cart.branch.name) : null;
        address = cart.branch.address != null ? String(cart.branch.address) : null;
      }
    } catch {
      // cart optional for browse
    }

    if (gen !== loadGen.current) return;
    setBranchMeta({ id: branchId, name, address });

    const sameProduct = productKeyRef.current === productKey && dataRef.current?.product?.id === productId;
    const sameBranch = branchIdRef.current === branchId;
    if (!force && sameProduct && sameBranch && dataRef.current?.product) {
      setLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    const showSkeleton = !dataRef.current?.product || productKeyRef.current !== productKey;
    if (showSkeleton) setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await api.product(productId, branchId ? { branchId } : undefined);
      if (gen !== loadGen.current) return;
      productKeyRef.current = productKey;
      branchIdRef.current = branchId;
      setData(res);
      setError(null);
      setNotFound(false);
    } catch (err: any) {
      if (gen !== loadGen.current) return;
      setData(null);
      productKeyRef.current = '';
      const is404 = err?.status === 404 || err?.code === 'PRODUCT_NOT_FOUND';
      setNotFound(is404);
      setError(err ?? {});
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
      return () => {
        loadGen.current += 1;
      };
    }, [load]),
  );

  const product = data?.product;
  const stock = useMemo(() => (data ? resolveStock(data) : { kind: 'no_branch' as const }), [data]);
  const canAdd = stock.kind !== 'unavailable';
  const maxQty = stock.kind === 'available' ? stock.qty : null;

  useEffect(() => {
    setQty(1);
  }, [product?.id]);

  useEffect(() => {
    if (maxQty != null && qty > maxQty) {
      setQty(Math.max(1, maxQty));
    }
  }, [maxQty, qty]);

  const { cheaperAnalogs, regularAnalogs } = useMemo(() => {
    if (!product || !Array.isArray(data?.analogs)) return { cheaperAnalogs: [], regularAnalogs: [] };
    const originalPrice = Number(product.price) || 0;
    const all = data.analogs
      .filter((item: any) => item?.id != null && item.id !== product.id)
      .map((item: any) => {
        const price = Number(item.price) || 0;
        const isCheaper = price < originalPrice;
        const savings = Math.max(0, originalPrice - price);
        const savingsPercent = isCheaper && originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0;
        return { ...item, isCheaper, savings, savingsPercent };
      });

    const cheaper = all.filter((a: any) => a.isCheaper).sort((a: any, b: any) => a.price - b.price);
    const regular = all.filter((a: any) => !a.isCheaper);
    return { cheaperAnalogs: cheaper, regularAnalogs: regular };
  }, [data?.analogs, product]);

  const analogs = regularAnalogs;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/catalog');
  };

  const onDec = () => setQty((q) => Math.max(1, q - 1));
  const onInc = () =>
    setQty((q) => {
      if (maxQty != null) return Math.min(maxQty, q + 1);
      return q + 1;
    });

  const [addedBanner, setAddedBanner] = useState(false);
  const bannerTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  const onAdd = async () => {
    if (!product || !canAdd || adding || addingLock.current) return;
    const productId = Number(product.id);
    if (!Number.isInteger(productId) || productId <= 0) return;
    const amount = Math.max(1, qty);
    if (maxQty != null && amount > maxQty) {
      notify(t('common.navCart'), t('catalog.exceedsStock'));
      return;
    }
    addingLock.current = true;
    setAdding(true);
    try {
      await api.addToCart(productId, amount);
      await refresh();
      setAddedBanner(true);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => {
        setAddedBanner(false);
      }, 4000);
    } catch (err) {
      notify(
        t('common.errorTitle'),
        localizeError(err, t, {
          byCode: {
            STOCK_UNAVAILABLE: 'catalog.errorStockUnavailable',
            PRODUCT_NOT_FOUND: 'catalog.productNotFound',
          },
          fallback: 'catalog.addToCartFailed',
        }),
      );
    } finally {
      addingLock.current = false;
      setAdding(false);
    }
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12);
  const sidePad = narrow ? 14 : 20;
  const footerReserve = 24 + 72 + bottomPad;

  const iconName =
    product?.icon && product.icon in MaterialCommunityIcons.glyphMap
      ? product.icon
      : 'pill';

  const header = (
    <View style={[styles.header, { paddingHorizontal: sidePad, paddingTop: topPad }]}>
      <Pressable
        style={styles.iconBtn}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {t('common.navProduct')}
      </Text>
      <Pressable
        style={styles.iconBtn}
        onPress={() => router.push('/cart')}
        accessibilityRole="button"
        accessibilityLabel={cartCount > 0 ? t('catalog.cartA11yCount', { count: cartCount }) : t('common.navCart')}
      >
        <Feather name="shopping-cart" size={18} color={PURPLE_DEEP} />
        {cartCount > 0 ? (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : String(cartCount)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  if (loading && !product) {
    return (
      <View style={styles.root}>
        {header}
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { width: contentWidth, paddingHorizontal: sidePad, paddingBottom: 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonBlock style={styles.skelVisual} />
          <SkeletonBlock style={[styles.skelLine, { width: '78%', height: 24, marginTop: 16 }]} />
          <SkeletonBlock style={[styles.skelLine, { width: '40%', height: 14, marginTop: 10 }]} />
          <SkeletonBlock style={[styles.skelLine, { width: '34%', height: 28, marginTop: 14 }]} />
          <SkeletonBlock style={[styles.skelLine, { width: '100%', height: 72, marginTop: 14, borderRadius: 16 }]} />
        </ScrollView>
      </View>
    );
  }

  if (error || !product) {
    const errorMessage = notFound || !error
      ? t('catalog.productNotFound')
      : localizeError(error, t, { fallback: 'catalog.productLoadFailed' });
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <MaterialCommunityIcons
            name={notFound ? 'package-variant-closed' : 'cloud-off-outline'}
            size={44}
            color={MUTED}
          />
          <Text style={styles.stateTitle}>{errorMessage}</Text>
          {notFound ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
              accessibilityRole="button"
              accessibilityLabel={t('catalog.backToCatalog')}
            >
              <Text style={styles.primaryBtnText}>{t('catalog.backToCatalog')}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => void load(true)}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
            >
              <Text style={styles.primaryBtnText}>{t('common.retry')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const cleanName = cleanText(localizedName(language, product));
  const cleanManufacturer = cleanText(product.manufacturer);
  const cleanDescription = cleanText(product.description);
  const category = cleanText(product.category);
  const unit = cleanText(product.unit);
  const metaBits = [category, unit || null].filter(Boolean) as string[];
  const productImg = getProductImage(product);

  return (
    <View style={styles.root}>
      {header}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            width: contentWidth,
            paddingHorizontal: sidePad,
            paddingBottom: footerReserve,
          },
        ]}
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[styles.visual, narrow && styles.visualNarrow]}
          accessibilityRole="image"
          accessibilityLabel={t('catalog.productIconA11y', { name: cleanName })}
        >
          {/* Studio ambient glow backdrop */}
          <View style={styles.ambientGlow} />

          {/* Floating Badges */}
          <View style={styles.cashbackBadge}>
            <Text style={styles.cashbackBadgeText}>{t('catalog.cashbackBadge')}</Text>
          </View>
          <View style={styles.ratingBadge}>
            <MaterialCommunityIcons name="star" size={13} color="#F59E0B" />
            <Text style={styles.ratingBadgeText}>{/* i18n-ignore */}4.9</Text>
          </View>

          {productImg ? (
            <Image
              source={productImg}
              style={styles.productImg}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons
                name={iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={narrow ? 56 : 64}
                color={PURPLE}
              />
            </View>
          )}
        </View>

        <Text style={[styles.name, narrow && styles.nameNarrow]}>{cleanName}</Text>

        {cleanManufacturer ? <Text style={styles.manufacturer}>{cleanManufacturer}</Text> : null}

        {metaBits.length ? (
          <Text style={styles.metaLine} numberOfLines={2}>
            {metaBits.join(' · ')}
          </Text>
        ) : null}

        <Text style={styles.price}>{fmt.money(Number(product.price) || 0)}</Text>

        {product.requiresPrescription ? (
          <View style={styles.rxBadge}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={PURPLE} />
            <Text style={styles.rxBadgeText}>{t('catalog.rxRequired')}</Text>
          </View>
        ) : null}

        <View style={styles.stockCard}>
          {stock.kind === 'no_branch' ? (
            <>
              <Text style={styles.stockLabel}>{t('catalog.stockNoBranch')}</Text>
              <Text style={styles.stockHint}>
                {t('catalog.stockAfterBranchHint')}
              </Text>
              <Pressable
                style={styles.branchBtn}
                onPress={() =>
                  router.push({
                    pathname: '/branches',
                    params: { from: 'product', productId: String(id) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('catalog.selectBranchA11y')}
              >
                <Feather name="map-pin" size={14} color={PURPLE} />
                <Text style={styles.branchBtnText}>{t('catalog.selectBranch')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {branchMeta.name ? (
                <Text style={styles.branchName} numberOfLines={2}>
                  {branchMeta.name}
                </Text>
              ) : null}
              {branchMeta.address ? (
                <Text style={styles.branchAddress} numberOfLines={2}>
                  {branchMeta.address}
                </Text>
              ) : null}
              {stock.kind === 'available' ? (
                <>
                  <Text style={[styles.stockLabel, styles.stockOk, branchMeta.name ? { marginTop: 8 } : null]}>
                    {t('catalog.stockAvailable')}
                  </Text>
                  <Text style={styles.stockHint}>{t('catalog.stockQty', { count: fmt.number(stock.qty) })}</Text>
                </>
              ) : (
                <Text style={[styles.stockLabel, styles.stockBad, branchMeta.name ? { marginTop: 8 } : null]}>
                  {t('catalog.stockUnavailable')}
                </Text>
              )}
              <Pressable
                style={styles.branchBtnGhost}
                onPress={() =>
                  router.push({
                    pathname: '/branches',
                    params: { from: 'product', productId: String(id) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('catalog.changeBranch')}
              >
                <Text style={styles.branchBtnGhostText}>{t('catalog.changeBranch')}</Text>
              </Pressable>
            </>
          )}
        </View>

        <Pressable
          style={styles.reminderCard}
          onPress={() =>
            router.push({
              pathname: '/reminders',
              params: {
                medicineName: cleanName,
                dosage: product.dosage || '',
                productId: String(product.id),
              },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('reminders.addToReminders')}
        >
          <View style={styles.reminderIconWrap}>
            <Feather name="bell" size={18} color={PURPLE} />
          </View>
          <View style={styles.reminderTextWrap}>
            <Text style={styles.reminderTitle}>{t('reminders.addToReminders')}</Text>
            <Text style={styles.reminderSubtitle}>{t('reminders.subtitle')}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={MUTED} />
        </Pressable>

        {cleanDescription ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('catalog.aboutProduct')}</Text>
            <Text style={styles.description}>{cleanDescription}</Text>
          </View>
        ) : null}

        {cheaperAnalogs.length > 0 ? (
          <View style={styles.cheaperSection}>
            <View style={styles.cheaperHeader}>
              <View style={styles.cheaperBadgeIcon}>
                <MaterialCommunityIcons name="lightning-bolt" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cheaperTitle}>{t('catalog.cheaperAnalogsTitle')}</Text>
                <Text style={styles.cheaperSubtitle}>
                  {t('catalog.cheaperAnalogsSubtitle', {
                    amount: fmt.money(cheaperAnalogs[0].savings),
                  })}
                </Text>
              </View>
            </View>

            {cheaperAnalogs.map((item: any) => {
              const itemImg = getProductImage(item);
              const cName = cleanText(localizedName(language, item));
              const cMan = cleanText(item.manufacturer);
              return (
                <View key={item.id} style={styles.cheaperCard}>
                  <Pressable
                    style={styles.cheaperCardTop}
                    onPress={() => router.push(`/product/${item.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={cName}
                  >
                    <View style={styles.analogIcon}>
                      {itemImg ? (
                        <Image source={itemImg} style={styles.analogImg} resizeMode="contain" />
                      ) : (
                        <MaterialCommunityIcons
                          name={
                            (item.icon && item.icon in MaterialCommunityIcons.glyphMap
                              ? item.icon
                              : 'pill') as React.ComponentProps<typeof MaterialCommunityIcons>['name']
                          }
                          size={22}
                          color="#059669"
                        />
                      )}
                    </View>
                    <View style={styles.analogBody}>
                      <Text style={styles.analogName} numberOfLines={2}>
                        {cName}
                      </Text>
                      {cMan ? (
                        <Text style={styles.analogMeta} numberOfLines={1}>
                          {cMan}
                        </Text>
                      ) : null}
                      <View style={styles.savingsPillWrap}>
                        <Text style={styles.savingsPillText}>
                          {t('catalog.savingsPill', {
                            amount: fmt.money(item.savings),
                            percent: item.savingsPercent,
                          })}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.cheaperPrice}>{fmt.money(Number(item.price) || 0)}</Text>
                      <Text style={styles.originalStrikethrough}>
                        {fmt.money(Number(product.price) || 0)}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={styles.substituteBtn}
                    onPress={async () => {
                      try {
                        await api.addToCart(item.id, 1);
                        await refresh();
                        notify(
                          t('catalog.addedToCartShort'),
                          `${cName} ${t('catalog.addedToCartShort')}`,
                        );
                      } catch {
                        notify(t('catalog.addToCartFailed'), t('catalog.loadFailedHint'));
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('catalog.substituteToCart')}
                  >
                    <MaterialCommunityIcons name="cart-plus" size={16} color="#059669" />
                    <Text style={styles.substituteBtnText}>{t('catalog.substituteToCart')}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        {analogs.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('catalog.similarProducts')}</Text>
            {analogs.map((item: any) => {
              const itemImg = getProductImage(item);
              const cName = cleanText(localizedName(language, item));
              const cMan = cleanText(item.manufacturer);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/product/${item.id}`)}
                  style={styles.analogRow}
                  accessibilityRole="button"
                  accessibilityLabel={cName}
                >
                  <View style={styles.analogIcon}>
                    {itemImg ? (
                      <Image source={itemImg} style={styles.analogImg} resizeMode="contain" />
                    ) : (
                      <MaterialCommunityIcons
                        name={
                          (item.icon && item.icon in MaterialCommunityIcons.glyphMap
                            ? item.icon
                            : 'pill') as React.ComponentProps<typeof MaterialCommunityIcons>['name']
                        }
                        size={22}
                        color={PURPLE}
                      />
                    )}
                  </View>
                  <View style={styles.analogBody}>
                    <Text style={styles.analogName} numberOfLines={2}>
                      {cName}
                    </Text>
                    {cMan ? (
                      <Text style={styles.analogMeta} numberOfLines={1}>
                        {cMan}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.analogPrice}>{fmt.money(Number(item.price) || 0)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}>
        <View style={{ maxWidth: contentWidth - sidePad * 2, width: '100%', gap: 10 }}>
          {addedBanner ? (
            <View style={styles.bannerRow} accessibilityRole="alert">
              <View style={styles.bannerLeft}>
                <Feather name="check" size={15} color={OK} />
                <Text style={styles.bannerText} numberOfLines={1}>
                  {t('catalog.addedToCartShort')}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/cart')}
                style={styles.bannerLink}
                accessibilityRole="button"
                accessibilityLabel={t('catalog.viewCart')}
              >
                <Text style={styles.bannerLinkText}>{t('catalog.viewCart')}</Text>
                <Feather name="chevron-right" size={14} color={PURPLE} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.footerInner}>
          {canAdd ? (
            <View style={styles.qtyWrap}>
              <Pressable
                style={[styles.qtyBtn, qty <= 1 && styles.qtyBtnDisabled]}
                onPress={onDec}
                disabled={qty <= 1 || adding}
                accessibilityRole="button"
                accessibilityLabel={t('catalog.qtyDecreaseA11y')}
              >
                <Feather name="minus" size={16} color={PURPLE_DEEP} />
              </Pressable>
              <Text style={styles.qtyValue} accessibilityLabel={t('catalog.qtyA11y', { count: qty })}>
                {qty}
              </Text>
              <Pressable
                style={[
                  styles.qtyBtn,
                  maxQty != null && qty >= maxQty && styles.qtyBtnDisabled,
                ]}
                onPress={onInc}
                disabled={adding || (maxQty != null && qty >= maxQty)}
                accessibilityRole="button"
                accessibilityLabel={t('catalog.qtyIncreaseA11y')}
              >
                <Feather name="plus" size={16} color={PURPLE_DEEP} />
              </Pressable>
            </View>
          ) : null}

          <Pressable
            testID="add-to-cart-btn"
            style={[styles.cta, (!canAdd || adding) && styles.ctaDisabled]}
            onPress={() => void onAdd()}
            disabled={!canAdd || adding}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdd || adding }}
            accessibilityLabel={canAdd ? t('catalog.addToCart') : t('catalog.stockUnavailable')}
          >
            {adding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="shopping-cart" size={16} color="#fff" />
                <Text style={styles.ctaText} numberOfLines={1}>
                  {canAdd ? t('catalog.addToCart') : t('catalog.stockUnavailable')}
                </Text>
              </>
            )}
          </Pressable>
        </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scroll: { flex: 1, width: '100%', maxWidth: '100%' },
  content: {
    alignSelf: 'center',
    paddingTop: 12,
  },

  header: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: CARD,
  },
  cartBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },

  visual: {
    height: 250,
    borderRadius: 24,
    backgroundColor: '#F8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ECE7F6',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  visualNarrow: {
    height: 210,
  },
  ambientGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#EDE9FE',
    opacity: 0.7,
  },
  productImg: {
    width: '88%',
    height: '88%',
    zIndex: 1,
  },
  cashbackBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 2,
  },
  cashbackBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: PURPLE,
  },
  ratingBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    zIndex: 2,
  },
  ratingBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#B45309',
  },
  iconBubble: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    zIndex: 1,
  },
  analogImg: {
    width: 36,
    height: 36,
  },

  name: {
    marginTop: 16,
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 30,
    color: PURPLE_DEEP,
  },
  nameNarrow: {
    fontSize: 22,
    lineHeight: 28,
  },
  manufacturer: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: MUTED,
  },
  metaLine: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
  },
  price: {
    marginTop: 12,
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: PURPLE,
  },
  rxBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3EAFB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCCEF2',
  },
  rxBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },

  stockCard: {
    marginTop: 16,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  branchAddress: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  stockLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  stockOk: { color: OK },
  stockBad: { color: BAD },
  stockHint: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  branchBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LAVENDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  branchBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  branchBtnGhost: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  branchBtnGhostText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },

  reminderCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    gap: 12,
  },
  reminderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTextWrap: {
    flex: 1,
  },
  reminderTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  reminderSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },

  section: { marginTop: 22 },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    marginBottom: 8,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
    color: '#4A5160',
  },

  analogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  analogIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analogBody: { flex: 1, minWidth: 0 },
  analogName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  analogMeta: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  analogPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE,
    flexShrink: 0,
    maxWidth: '34%',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CARD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    alignItems: 'center',
    paddingTop: 12,
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  bannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: OK,
    flex: 1,
  },
  bannerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingLeft: 8,
  },
  bannerLinkText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 3,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  cta: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaDisabled: { backgroundColor: '#C4B5D8' },
  ctaText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },

  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 12,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },

  cheaperSection: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    gap: 12,
  },
  cheaperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cheaperBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cheaperTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#065F46',
  },
  cheaperSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  cheaperCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    padding: 12,
    gap: 10,
  },
  cheaperCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savingsPillWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#DEF7EC',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  savingsPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#03543F',
  },
  cheaperPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#059669',
  },
  originalStrikethrough: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
    textDecorationLine: 'line-through',
  },
  substituteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingVertical: 8,
    gap: 6,
  },
  substituteBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#059669',
  },

  skel: {
    backgroundColor: '#E6E1F2',
    borderRadius: 10,
  },
  skelVisual: {
    height: 168,
    borderRadius: 22,
    width: '100%',
  },
  skelLine: {
    height: 16,
    borderRadius: 8,
  },
});
