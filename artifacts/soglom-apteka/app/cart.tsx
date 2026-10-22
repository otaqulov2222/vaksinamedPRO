import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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
import { api, type ApiError } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { localizeError } from '@/lib/i18n/errors';
import { fulfillmentTypeLabel } from '@/lib/orderLabels';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F4F2F8';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const OK = '#16A34A';
const BAD = '#DC2626';
const WARN = '#D97706';

const PRODUCT_IMAGES: Record<string, any> = {
  'cat-p1': require('../assets/images/cat-p1-d3.png'),
  'cat-p2': require('../assets/images/cat-p2-c.png'),
  'cat-p3': require('../assets/images/cat-p3-mg.png'),
  'cat-p4': require('../assets/images/cat-p4-omega.png'),
  'cat-p5': require('../assets/images/cat-p5-zn.png'),
  'cat-p6': require('../assets/images/cat-p6-para.png'),
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

const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';
const FOCUS_FRESH_MS = 400;

type PriceSnap = Record<string, number>;
type BusyAction = 'inc' | 'dec' | 'remove';
type CartNotice = { code: string; message: string; productId?: number; cartItemId?: number };

async function readSnap(): Promise<PriceSnap> {
  try {
    const raw = await AsyncStorage.getItem(PRICE_SNAP_KEY);
    return raw ? (JSON.parse(raw) as PriceSnap) : {};
  } catch {
    return {};
  }
}

async function writeSnap(items: any[]) {
  const next: PriceSnap = {};
  for (const item of items) {
    const price = Number(item.unitPrice ?? item.product?.price);
    if (Number.isFinite(price)) next[String(item.id)] = price;
  }
  await AsyncStorage.setItem(PRICE_SNAP_KEY, JSON.stringify(next));
}

function productIconName(icon: unknown) {
  const raw = typeof icon === 'string' ? icon : 'pill';
  return (
    raw in MaterialCommunityIcons.glyphMap ? raw : 'pill'
  ) as React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.skel, style]} />;
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { syncCartCount, t, fmt, language } = useApp();
  const narrow = width < 380;
  const contentWidth = Math.min(width, 480);

  const [cart, setCart] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMap, setBusyMap] = useState<Record<number, BusyAction>>({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [priceFlags, setPriceFlags] = useState<Record<string, { previous: number; current: number }>>({});
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const [footerHeight, setFooterHeight] = useState(0);

  const loadGen = useRef(0);
  const busyItemsRef = useRef<Set<number>>(new Set());
  const checkoutLock = useRef(false);
  const cartRef = useRef<any>(null);
  const lastFetchAt = useRef(0);
  cartRef.current = cart;

  const applyPayload = useCallback(
    async (data: any) => {
      const prev = await readSnap();
      const flags: Record<string, { previous: number; current: number }> = {};
      for (const item of data.items || []) {
        const key = String(item.id);
        const current = Number(item.unitPrice ?? item.product?.price);
        const previous = prev[key];
        if (
          previous != null
          && Number.isFinite(previous)
          && Number.isFinite(current)
          && previous !== current
        ) {
          flags[key] = { previous, current };
        }
      }
      setPriceFlags(flags);
      setNotices(Array.isArray(data.notices) ? data.notices : []);
      setCart(data);
      setError(null);
      syncCartCount(Array.isArray(data.items) ? data.items.length : 0);
      lastFetchAt.current = Date.now();
      await writeSnap(data.items || []);
    },
    [syncCartCount],
  );

  const load = useCallback(
    async (opts?: { forceSkeleton?: boolean; force?: boolean }) => {
      if (
        !opts?.force
        && cartRef.current
        && Date.now() - lastFetchAt.current < FOCUS_FRESH_MS
      ) {
        return;
      }
      const gen = ++loadGen.current;
      const showSkeleton = opts?.forceSkeleton || !cartRef.current;
      if (showSkeleton) setLoading(true);
      try {
        const data = await api.cart();
        if (gen !== loadGen.current) return;
        await applyPayload(data);
      } catch (e) {
        if (gen !== loadGen.current) return;
        if (!cartRef.current) {
          setCart(null);
          setError(localizeError(e, t));
        } else {
          notify(t('common.errorTitle'), localizeError(e, t, { fallback: 'cart.cartRefreshFailed' }));
        }
      } finally {
        if (gen === loadGen.current) setLoading(false);
      }
    },
    [applyPayload, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load({ force: true });
      return () => {
        loadGen.current += 1;
      };
    }, [load]),
  );

  const beginItemBusy = (id: number, action: BusyAction) => {
    if (busyItemsRef.current.has(id)) return false;
    busyItemsRef.current.add(id);
    setBusyMap((prev) => ({ ...prev, [id]: action }));
    return true;
  };

  const endItemBusy = (id: number) => {
    busyItemsRef.current.delete(id);
    setBusyMap((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const changeQty = async (item: any, nextQty: number, action: 'inc' | 'dec') => {
    const id = Number(item.id);
    const safeQty = Math.floor(Number(nextQty));
    if (!Number.isFinite(id) || !Number.isFinite(safeQty) || safeQty < 1) return;
    if (!beginItemBusy(id, action)) return;
    try {
      const data = await api.updateCartItem(id, safeQty);
      await applyPayload(data);
    } catch (e) {
      const err = e as ApiError;
      const stock = err.code === 'STOCK_UNAVAILABLE';
      notify(
        stock ? t('cart.stockTitle') : t('common.errorTitle'),
        localizeError(err, t, { fallback: stock ? 'cart.stockUnavailable' : 'cart.cartQtyUpdateFailed' }),
      );
      await load({ forceSkeleton: false, force: true });
    } finally {
      endItemBusy(id);
    }
  };

  const executeRemove = async (item: any) => {
    const id = Number(item.id);
    if (!Number.isFinite(id)) return;
    if (!beginItemBusy(id, 'remove')) return;
    try {
      const data = await api.removeCartItem(id);
      await applyPayload(data);
    } catch (e) {
      notify(t('common.errorTitle'), localizeError(e, t, { fallback: 'cart.cartRemoveFailed' }));
      await load({ forceSkeleton: false, force: true });
    } finally {
      endItemBusy(id);
    }
  };

  const requestRemove = async (item: any) => {
    const id = Number(item.id);
    if (!Number.isFinite(id)) return;
    if (busyItemsRef.current.has(id)) return;

    const confirmed = await confirmAction({
      title: t('cart.cartRemoveTitle'),
      message: t('cart.cartRemoveMessage'),
      confirmText: t('cart.cartRemoveConfirm'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!confirmed) return;
    await executeRemove(item);
  };

  const openProduct = (product: any) => {
    const productId = Number(product?.id);
    if (!Number.isInteger(productId) || productId <= 0) return;
    router.push(`/product/${productId}`);
  };

  const goCheckout = async () => {
    if (checkoutLock.current || checkoutBusy) return;
    const items = Array.isArray(cart?.items) ? cart.items : [];
    if (!items.length) return;

    checkoutLock.current = true;
    setCheckoutBusy(true);
    try {
      const hasBranch = Boolean(cart?.branch?.id ?? cart?.cart?.branchId);
      if (!hasBranch) {
        const goBranch = await confirmAction({
          title: t('cart.branchLabel'),
          message: t('cart.cartBranchRequiredMessage'),
          confirmText: t('cart.chooseBranch'),
          cancelText: t('common.cancel'),
        });
        if (goBranch) {
          router.push({ pathname: '/branches', params: { from: 'cart' } });
        }
        return;
      }

      const stockIssue = items.some((item: any) => Boolean(item.stockInsufficient));
      if (stockIssue) {
        const proceed = await confirmAction({
          title: t('cart.stockTitle'),
          message: t('cart.stockShortMessage'),
          confirmText: t('common.continue'),
          cancelText: t('common.cancel'),
        });
        if (!proceed) return;
      }

      router.push('/checkout');
    } catch (e) {
      notify(t('common.errorTitle'), localizeError(e, t, { fallback: 'cart.cartCheckoutOpenFailed' }));
    } finally {
      setTimeout(() => {
        checkoutLock.current = false;
        setCheckoutBusy(false);
      }, 450);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/catalog');
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 14);
  const sidePad = narrow ? 14 : 18;
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const hasItems = items.length > 0;
  const footerFallback = 14 + 56 + 12 + bottomPad;
  const footerReserve = hasItems
    ? (footerHeight > 0 ? footerHeight : footerFallback) + 24
    : 24 + bottomPad;
  const subtotalNum = Number(cart?.subtotal);
  const subtotalKnown = Number.isFinite(subtotalNum) && subtotalNum >= 0;
  const subtotalLabel = subtotalKnown ? fmt.money(subtotalNum) : t('common.dash');
  const headerSubtitle = hasItems
    ? t('cart.cartSubtitleItems', { count: items.length })
    : t('cart.cartSubtitleEmpty');

  const noticeText = (n: CartNotice) => {
    if (n.code === 'PRODUCT_REMOVED') return t('cart.cartNoticeProductRemoved');
    if (n.code === 'STOCK_CHANGED') {
      const match = items.find((item: any) =>
        n.cartItemId != null
          ? Number(item.id) === Number(n.cartItemId)
          : n.productId != null && Number(item.productId ?? item.product?.id) === Number(n.productId),
      );
      const avail = match?.available;
      return avail != null && Number.isFinite(Number(avail))
        ? t('cart.cartStockChangedQty', { count: Math.max(0, Number(avail)) })
        : t('cart.cartStockChanged');
    }
    return n.message;
  };

  const openBranches = () => {
    router.push({ pathname: '/branches', params: { from: 'cart' } });
  };

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
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('common.navCart')}
        </Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {headerSubtitle}
        </Text>
      </View>
      <View style={styles.iconBtnGhost} />
    </View>
  );

  if (loading && !cart) {
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
          <SkeletonBlock style={{ height: 72, borderRadius: 16, width: '100%', marginBottom: 12 }} />
          <SkeletonBlock style={{ height: 130, borderRadius: 18, width: '100%', marginBottom: 12 }} />
          <SkeletonBlock style={{ height: 130, borderRadius: 18, width: '100%', marginBottom: 12 }} />
          <SkeletonBlock style={{ height: 100, borderRadius: 16, width: '100%' }} />
        </ScrollView>
      </View>
    );
  }

  if (error && !cart) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <View style={styles.stateIcon}>
            <MaterialCommunityIcons name="cloud-off-outline" size={36} color={MUTED} />
          </View>
          <Text style={styles.stateTitle}>{t('cart.cartLoadFailed')}</Text>
          <Text style={styles.stateHint}>{error}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void load({ forceSkeleton: true, force: true })}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.primaryBtnText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branch Selection Card */}
        <View style={[styles.branchCard, !cart?.branch?.name && styles.branchCardWarn]}>
          <View style={styles.branchRow}>
            <View style={styles.branchIconWrap}>
              <Feather name="map-pin" size={18} color={PURPLE} />
            </View>
            <View style={styles.branchBody}>
              {cart?.branch?.name ? (
                <>
                  <Text style={styles.branchLabel}>{t('cart.branchLabel')}</Text>
                  <Text style={styles.branchName} numberOfLines={2}>
                    {String(cart.branch.name)}
                  </Text>
                  {cart.branch.address ? (
                    <Text style={styles.branchAddress} numberOfLines={1}>
                      {String(cart.branch.address)}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.branchWarn}>{t('cart.branchNotSelected')}</Text>
                  <Text style={styles.branchHint} numberOfLines={2}>
                    {t('cart.cartBranchStockHint')}
                  </Text>
                </>
              )}
            </View>
            <Pressable
              style={styles.branchAction}
              onPress={openBranches}
              accessibilityRole="button"
              accessibilityLabel={cart?.branch?.name ? t('cart.changeBranchA11y') : t('cart.chooseBranch')}
            >
              <Text style={styles.branchActionText} numberOfLines={1}>
                {cart?.branch?.name ? t('cart.change') : t('cart.cartChoose')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Notices (Price/Stock Changes) */}
        {notices.map((n, i) => (
          <View key={`${n.code}-${i}`} style={styles.notice}>
            <Feather name="info" size={15} color={WARN} style={{ marginTop: 1 }} />
            <Text style={styles.noticeText}>{noticeText(n)}</Text>
          </View>
        ))}

        {!hasItems ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="shopping-bag" size={32} color={PURPLE} />
            </View>
            <Text style={styles.emptyTitle}>{t('cart.cartEmptyTitle')}</Text>
            <Text style={styles.emptyHint}>{t('cart.cartEmptyHint')}</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
              accessibilityRole="button"
              accessibilityLabel={t('cart.cartBrowseProducts')}
            >
              <Text style={styles.primaryBtnText}>{t('cart.cartBrowseProducts')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item: any) => {
              const product = item.product || {};
              const rawName = localizedName(language, product) || t('cart.productFallbackName');
              const name = cleanText(rawName);
              const manufacturer = cleanText(product.manufacturer);
              const unit = cleanText(product.unit);
              const metaLine = [manufacturer, unit].filter(Boolean).join(' · ');
              const unitPrice = Number(item.unitPrice ?? product.price ?? 0);
              const lineTotal = Number(item.lineTotal ?? unitPrice * Number(item.quantity || 0));
              const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
              const flag = priceFlags[String(item.id)];
              const itemId = Number(item.id);
              const busyAction = busyMap[itemId] ?? null;
              const itemBusy = busyAction != null;
              const known = Boolean(item.availabilityKnown);
              const availableRaw = item.available;
              const availableKnownQty =
                known && availableRaw != null && Number.isFinite(Number(availableRaw))
                  ? Math.max(0, Number(availableRaw))
                  : null;
              const minusDisabled = qty <= 1 || itemBusy;
              const plusDisabled =
                itemBusy || (availableKnownQty != null && qty >= availableKnownQty);
              const itemImg = getProductImage(product);

              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Pressable
                      style={styles.productHit}
                      onPress={() => openProduct(product)}
                      accessibilityRole="button"
                      accessibilityLabel={t('cart.cartOpenProductA11y', { name })}
                    >
                      <View
                        style={styles.itemIcon}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        <View style={styles.itemAmbientGlow} />
                        {itemImg ? (
                          <Image source={itemImg} style={styles.itemImg} resizeMode="contain" />
                        ) : (
                          <MaterialCommunityIcons
                            name={productIconName(product.icon)}
                            size={24}
                            color={PURPLE}
                          />
                        )}
                      </View>
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {name}
                        </Text>
                        {metaLine ? (
                          <Text style={styles.itemMeta} numberOfLines={1}>
                            {metaLine}
                          </Text>
                        ) : null}
                        <Text style={styles.itemUnitPrice} numberOfLines={1}>
                          {fmt.money(unitPrice)}
                        </Text>
                      </View>
                    </Pressable>

                    <Pressable
                      style={[styles.removeBtn, itemBusy && styles.controlDisabled]}
                      onPress={() => void requestRemove(item)}
                      disabled={itemBusy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: itemBusy }}
                      accessibilityLabel={t('cart.cartRemoveItemA11y')}
                    >
                      {busyAction === 'remove' ? (
                        <ActivityIndicator size="small" color={BAD} />
                      ) : (
                        <Feather name="trash-2" size={16} color={BAD} />
                      )}
                    </Pressable>
                  </View>

                  {flag ? (
                    <Text style={styles.priceFlag} accessibilityLiveRegion="polite">
                      {t('cart.cartPriceChanged', {
                        previous: fmt.money(flag.previous),
                        current: fmt.money(flag.current),
                      })}
                    </Text>
                  ) : null}

                  {item.stockInsufficient && known ? (
                    <Text style={styles.stockBad} accessibilityLiveRegion="polite">
                      {availableKnownQty != null
                        ? t('cart.cartStockChangedQty', { count: availableKnownQty })
                        : t('cart.cartStockChanged')}
                    </Text>
                  ) : availableKnownQty != null ? (
                    <Text style={styles.stockOk}>
                      {t('cart.cartStockAvailable', { count: availableKnownQty })}
                    </Text>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <View style={styles.qtyWrap}>
                      <Pressable
                        style={[styles.qtyBtn, minusDisabled && styles.controlDisabled]}
                        onPress={() => void changeQty(item, qty - 1, 'dec')}
                        disabled={minusDisabled}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: minusDisabled }}
                        accessibilityLabel={t('cart.cartDecreaseA11y')}
                        hitSlop={6}
                      >
                        {busyAction === 'dec' ? (
                          <ActivityIndicator size="small" color={PURPLE_DEEP} />
                        ) : (
                          <Feather
                            name="minus"
                            size={16}
                            color={minusDisabled ? MUTED : PURPLE_DEEP}
                          />
                        )}
                      </Pressable>
                      <Text
                        style={styles.qtyValue}
                        accessibilityLabel={t('cart.cartQtyA11y', { count: qty })}
                        accessibilityRole="text"
                      >
                        {qty}
                      </Text>
                      <Pressable
                        style={[styles.qtyBtn, plusDisabled && styles.controlDisabled]}
                        onPress={() => void changeQty(item, qty + 1, 'inc')}
                        disabled={plusDisabled}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: plusDisabled }}
                        accessibilityLabel={t('cart.cartIncreaseA11y')}
                        hitSlop={6}
                      >
                        {busyAction === 'inc' ? (
                          <ActivityIndicator size="small" color={PURPLE_DEEP} />
                        ) : (
                          <Feather
                            name="plus"
                            size={16}
                            color={plusDisabled ? MUTED : PURPLE_DEEP}
                          />
                        )}
                      </Pressable>
                    </View>
                    <Text style={styles.lineTotal} numberOfLines={1}>
                      {fmt.money(lineTotal)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Order Financial Summary Card */}
        {hasItems ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t('cart.summaryTitle')}</Text>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('cart.summaryItems')}</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {subtotalLabel}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{fulfillmentTypeLabel(t, 'pickup')}</Text>
              <Text style={styles.summaryValueFree} numberOfLines={1}>
                {t('cart.checkoutPickupFree')}
              </Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>{t('cart.cartTotal')}</Text>
              <Text style={styles.summaryTotalValue} numberOfLines={1}>
                {subtotalLabel}
              </Text>
            </View>

            <Text style={styles.summaryNote}>
              {t('cart.cartSummaryNote')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      {hasItems ? (
        <View
          style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && Math.abs(h - footerHeight) > 1) setFooterHeight(h);
          }}
        >
          <View style={[styles.footerInner, { maxWidth: contentWidth - sidePad * 2, width: '100%' }]}>
            <View style={styles.footerPriceCol}>
              <Text style={styles.footerPriceLabel}>{t('cart.checkoutTotalToPay')}</Text>
              <Text style={styles.footerPriceValue} numberOfLines={1}>
                {subtotalLabel}
              </Text>
            </View>

            <Pressable
              style={[styles.cta, checkoutBusy && styles.ctaBusy]}
              onPress={() => void goCheckout()}
              disabled={checkoutBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: checkoutBusy }}
              accessibilityLabel={t('cart.cartCheckoutCta')}
            >
              {checkoutBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.ctaContent}>
                  <Text style={styles.ctaText} numberOfLines={1}>
                    {t('cart.cartCheckoutCta')}
                  </Text>
                  <Feather name="arrow-right" size={17} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
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
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
  },
  content: {
    alignSelf: 'center',
    paddingTop: 12,
  },

  header: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    zIndex: 10,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
  },
  headerSub: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnGhost: {
    width: 40,
    height: 40,
  },

  /* Branch card */
  branchCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(26, 16, 64, 0.04)' } as any,
      default: {
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  branchCardWarn: {
    borderColor: '#DDD6FE',
    backgroundColor: '#FAF8FF',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  branchIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  branchBody: {
    flex: 1,
    minWidth: 0,
  },
  branchLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
    marginBottom: 2,
  },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  branchAddress: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  branchWarn: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13.5,
    color: PURPLE_DEEP,
  },
  branchHint: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: MUTED,
  },
  branchAction: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: PURPLE,
  },
  branchActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },

  /* Notice */
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: WARN,
  },

  /* Empty state */
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: PURPLE_DEEP,
  },
  emptyHint: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 280,
  },

  /* Products List */
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(26, 16, 64, 0.04)' } as any,
      default: {
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  productHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  itemIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FAF9FD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ECE7F6',
    position: 'relative',
    overflow: 'hidden',
  },
  itemImg: {
    width: '84%',
    height: '84%',
    zIndex: 1,
  },
  itemAmbientGlow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE9FE',
    opacity: 0.6,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  itemMeta: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: MUTED,
  },
  itemUnitPrice: {
    marginTop: 4,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  priceFlag: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: WARN,
  },
  stockOk: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: OK,
  },
  stockBad: {
    marginTop: 6,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: BAD,
  },

  cardFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0EEF5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F1FB',
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingVertical: 2,
    gap: 2,
    borderWidth: 1,
    borderColor: '#ECE7F6',
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  lineTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    textAlign: 'right',
  },
  controlDisabled: {
    opacity: 0.45,
  },

  /* Order Summary Card */
  summaryCard: {
    marginTop: 14,
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(26, 16, 64, 0.04)' } as any,
    }),
  },
  summaryTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    color: PURPLE_DEEP,
  },
  summaryValueFree: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: OK,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F0EEF5',
    marginVertical: 10,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  summaryTotalLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  summaryTotalValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE,
  },
  summaryNote: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    color: MUTED,
  },

  /* Sticky Footer */
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: 'center',
    paddingTop: 12,
    ...Platform.select({
      web: { boxShadow: '0 -4px 20px rgba(26, 16, 64, 0.08)' } as any,
      default: {
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
    zIndex: 100,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  footerPriceCol: {
    flex: 1,
    minWidth: 0,
  },
  footerPriceLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: MUTED,
    marginBottom: 2,
  },
  footerPriceValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
  },
  cta: {
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0 4px 14px rgba(106, 34, 214, 0.35)' } as any,
      default: {
        shadowColor: PURPLE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  ctaBusy: {
    opacity: 0.72,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },

  /* State & Skeleton */
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  stateIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  stateHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  skel: {
    backgroundColor: '#EBE7F5',
    borderRadius: 12,
  },
});
