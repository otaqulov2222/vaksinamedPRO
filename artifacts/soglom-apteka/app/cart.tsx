import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { api, type ApiError } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F3F1F7';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const OK = '#3D7A55';
const BAD = '#B91C1C';
const WARN = '#B45309';
const YELLOW = '#FFCC00';

const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';
const FOCUS_FRESH_MS = 400;

type PriceSnap = Record<string, number>;
type BusyAction = 'inc' | 'dec' | 'remove';
type PreflightChoice = 'continue' | 'cancel';

const priceUz = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

function toast(title: string, msg: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

/**
 * Binary confirm with identical semantics on web and native:
 * - Confirm / OK → true
 * - Cancel → false
 * Never map Cancel to a destructive or “continue” action.
 */
function askConfirm(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const cancelLabel = opts.cancelLabel ?? 'Bekor qilish';
  if (Platform.OS === 'web') {
    // window.confirm: OK=true, Cancel=false — labels must match that mapping.
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      `${opts.title}\n\n${opts.message}\n\nOK — ${opts.confirmLabel}\nCancel — ${cancelLabel}`,
    );
    return Promise.resolve(Boolean(ok));
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmLabel,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Stock warning before checkout: Continue vs Cancel (same OK/Cancel mapping on web). */
function askContinueOrCancel(opts: {
  title: string;
  message: string;
  continueLabel: string;
  cancelLabel?: string;
}): Promise<PreflightChoice> {
  const cancelLabel = opts.cancelLabel ?? 'Bekor qilish';
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      `${opts.title}\n\n${opts.message}\n\nOK — ${opts.continueLabel}\nCancel — ${cancelLabel}`,
    );
    return Promise.resolve(ok ? 'continue' : 'cancel');
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve('cancel') },
      { text: opts.continueLabel, onPress: () => resolve('continue') },
    ]);
  });
}

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
  const { syncCartCount } = useApp();
  const narrow = width < 380;
  const contentWidth = Math.min(width, 480);

  const [cart, setCart] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMap, setBusyMap] = useState<Record<number, BusyAction>>({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [priceFlags, setPriceFlags] = useState<Record<string, { previous: number; current: number }>>({});
  const [notices, setNotices] = useState<Array<{ code: string; message: string }>>([]);
  const [footerHeight, setFooterHeight] = useState(0); // sticky footer clearance

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
          setError(e instanceof Error ? e.message : 'Savatni yuklab bo‘lmadi');
        } else {
          toast('Xatolik', e instanceof Error ? e.message : 'Savatni yangilab bo‘lmadi');
        }
      } finally {
        if (gen === loadGen.current) setLoading(false);
      }
    },
    [applyPayload],
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
    // Item stays in cart at min 1; remove uses confirmed trash action only.
    if (!Number.isFinite(id) || !Number.isFinite(safeQty) || safeQty < 1) return;
    if (!beginItemBusy(id, action)) return;
    try {
      const data = await api.updateCartItem(id, safeQty);
      await applyPayload(data);
    } catch (e) {
      const err = e as ApiError;
      toast(
        err.code === 'STOCK_UNAVAILABLE' ? 'Qoldiq' : 'Xatolik',
        err.message || 'Miqdor yangilanmadi',
      );
      // Keep prior UI until server refresh — do not pretend success.
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
      const err = e as ApiError;
      toast('Xatolik', err.message || 'Mahsulot o‘chirilmadi');
      await load({ forceSkeleton: false, force: true });
    } finally {
      endItemBusy(id);
    }
  };

  const requestRemove = async (item: any) => {
    const id = Number(item.id);
    if (!Number.isFinite(id)) return;
    if (busyItemsRef.current.has(id)) return;

    const confirmed = await askConfirm({
      title: 'Mahsulotni o‘chirish',
      message: 'Bu mahsulotni savatdan o‘chirmoqchimisiz?',
      confirmLabel: 'O‘chirish',
      cancelLabel: 'Bekor qilish',
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
        // Cancel stays on cart; Confirm opens branch picker — never continue without branch.
        const goBranch = await askConfirm({
          title: 'Filial',
          message:
            'Filial tanlanmagan. Buyurtmani rasmiylashtirishdan oldin filialni tanlang.',
          confirmLabel: 'Filial tanlash',
          cancelLabel: 'Bekor qilish',
        });
        if (goBranch) {
          router.push({ pathname: '/branches', params: { from: 'cart' } });
        }
        return;
      }

      const stockIssue = items.some((item: any) => Boolean(item.stockInsufficient));
      if (stockIssue) {
        const choice = await askContinueOrCancel({
          title: 'Qoldiq',
          message: 'Ba’zi mahsulotlar tanlangan filialda yetarli emas.',
          continueLabel: 'Davom etish',
          cancelLabel: 'Bekor qilish',
        });
        if (choice === 'cancel') return;
      }

      router.push('/checkout');
    } catch (e) {
      toast('Xatolik', e instanceof Error ? e.message : 'Checkout ochilmadi');
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
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12);
  const sidePad = narrow ? 14 : 20;
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const hasItems = items.length > 0;
  const footerFallback = 12 + 22 + 8 + 52 + bottomPad;
  const footerReserve = hasItems
    ? (footerHeight > 0 ? footerHeight : footerFallback) + 20
    : 24 + bottomPad;
  const subtotalNum = Number(cart?.subtotal);
  const subtotalKnown = Number.isFinite(subtotalNum) && subtotalNum >= 0;
  const subtotalLabel = subtotalKnown ? priceUz(subtotalNum) : '—';
  const headerSubtitle = hasItems
    ? `Tanlagan mahsulotlaringiz · ${items.length} ta tur`
    : 'Savatda hozircha mahsulot yo‘q';

  const openBranches = () => {
    router.push({ pathname: '/branches', params: { from: 'cart' } });
  };

  const header = (
    <View style={[styles.header, { paddingHorizontal: sidePad, paddingTop: topPad }]}>
      <Pressable
        style={styles.iconBtn}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Orqaga"
      >
        <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Savat
        </Text>
        <Text style={styles.headerSub} numberOfLines={2}>
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
          <SkeletonBlock style={{ height: 64, borderRadius: 16, width: '100%' }} />
          <SkeletonBlock style={{ height: 120, borderRadius: 18, width: '100%', marginTop: 10 }} />
          <SkeletonBlock style={{ height: 120, borderRadius: 18, width: '100%', marginTop: 10 }} />
          <SkeletonBlock style={{ height: 72, borderRadius: 16, width: '100%', marginTop: 14 }} />
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
            <MaterialCommunityIcons name="cloud-off-outline" size={32} color={MUTED} />
          </View>
          <Text style={styles.stateTitle}>Savatni yuklab bo‘lmadi</Text>
          <Text style={styles.stateHint}>{error}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void load({ forceSkeleton: true, force: true })}
            accessibilityRole="button"
            accessibilityLabel="Qayta urinish"
          >
            <Text style={styles.primaryBtnText}>Qayta urinish</Text>
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
        {/* Branch — compact strip */}
        <View style={[styles.branchCard, !cart?.branch?.name && styles.branchCardWarn]}>
          <View style={styles.branchRow}>
            <View style={styles.branchIconWrap}>
              <Feather name="map-pin" size={16} color={cart?.branch?.name ? PURPLE : WARN} />
            </View>
            <View style={styles.branchBody}>
              {cart?.branch?.name ? (
                <>
                  <Text style={styles.branchLabel}>Filial</Text>
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
                  <Text style={styles.branchWarn}>Filial tanlanmagan</Text>
                  <Text style={styles.branchHint} numberOfLines={2}>
                    Qoldiq filial tanlangandan keyin aniqlanadi.
                  </Text>
                </>
              )}
            </View>
            <Pressable
              style={styles.branchAction}
              onPress={openBranches}
              accessibilityRole="button"
              accessibilityLabel={cart?.branch?.name ? 'Filialni o‘zgartirish' : 'Filial tanlash'}
            >
              <Text style={styles.branchActionText} numberOfLines={1}>
                {cart?.branch?.name ? 'O‘zgartirish' : 'Tanlash'}
              </Text>
            </Pressable>
          </View>
        </View>

        {notices.map((n, i) => (
          <View key={`${n.code}-${i}`} style={styles.notice}>
            <Feather name="info" size={14} color={WARN} />
            <Text style={styles.noticeText}>{n.message}</Text>
          </View>
        ))}

        {!hasItems ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="shopping-cart" size={26} color={PURPLE} />
            </View>
            <Text style={styles.emptyTitle}>Savat bo‘sh</Text>
            <Text style={styles.emptyHint}>
              Mahsulot tanlang va buyurtmangizni shu yerda rasmiylashtiring.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
              accessibilityRole="button"
              accessibilityLabel="Mahsulot tanlash"
            >
              <Text style={styles.primaryBtnText}>Mahsulot tanlash</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item: any) => {
              const product = item.product || {};
              const name = String(product.nameUz || product.nameRu || 'Mahsulot');
              const manufacturer = String(product.manufacturer || '').trim();
              const unit = String(product.unit || '').trim();
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

              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Pressable
                      style={styles.productHit}
                      onPress={() => openProduct(product)}
                      accessibilityRole="button"
                      accessibilityLabel={`${name} — mahsulotni ko‘rish`}
                    >
                      <View
                        style={styles.itemIcon}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        <MaterialCommunityIcons
                          name={productIconName(product.icon)}
                          size={26}
                          color={PURPLE}
                        />
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
                          {priceUz(unitPrice)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={[styles.removeBtn, itemBusy && styles.controlDisabled]}
                      onPress={() => void requestRemove(item)}
                      disabled={itemBusy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: itemBusy }}
                      accessibilityLabel="Mahsulotni savatdan o‘chirish"
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
                      Narx o‘zgargan: {priceUz(flag.previous)} → {priceUz(flag.current)}
                    </Text>
                  ) : null}

                  {item.stockInsufficient && known ? (
                    <Text style={styles.stockBad} accessibilityLiveRegion="polite">
                      Mavjud miqdor o‘zgargan
                      {availableKnownQty != null ? ` (mavjud: ${availableKnownQty} dona)` : ''}
                    </Text>
                  ) : availableKnownQty != null ? (
                    <Text style={styles.stockOk}>Mavjud: {availableKnownQty} dona</Text>
                  ) : !known ? (
                    <View style={styles.stockWarnBlock} accessibilityLiveRegion="polite">
                      <Text style={styles.stockWarn}>Filial tanlanmagan</Text>
                      <Text style={styles.stockWarnHint}>
                        Qoldiq filial tanlangandan keyin aniqlanadi.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <View style={styles.qtyWrap}>
                      <Pressable
                        style={[styles.qtyBtn, minusDisabled && styles.controlDisabled]}
                        onPress={() => void changeQty(item, qty - 1, 'dec')}
                        disabled={minusDisabled}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: minusDisabled }}
                        accessibilityLabel="Mahsulot sonini kamaytirish"
                        hitSlop={4}
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
                        accessibilityLabel={`Miqdor ${qty}`}
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
                        accessibilityLabel="Mahsulot sonini oshirish"
                        hitSlop={4}
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
                      {priceUz(lineTotal)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {hasItems ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Hisob (taxminiy)</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Mahsulotlar</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {subtotalLabel}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>Jami</Text>
              <Text style={styles.summaryTotalValue} numberOfLines={1}>
                {subtotalLabel}
              </Text>
            </View>
            <Text style={styles.summaryNote}>
              Cashback va yetkazish — rasmiylashtirishda. Yakuniy summa serverda hisoblanadi.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {hasItems ? (
        <View
          style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && Math.abs(h - footerHeight) > 1) setFooterHeight(h);
          }}
        >
          <View style={[styles.footerInner, { maxWidth: contentWidth - sidePad * 2, width: '100%' }]}>
            <View style={styles.footerSum}>
              <Text style={styles.footerSumLabel}>Oraliq jami</Text>
              <Text style={styles.footerSumValue} numberOfLines={1}>
                {subtotalLabel}
              </Text>
            </View>
            <Pressable
              style={[styles.cta, checkoutBusy && styles.ctaBusy]}
              onPress={() => void goCheckout()}
              disabled={checkoutBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: checkoutBusy }}
              accessibilityLabel="Rasmiylashtirish"
            >
              {checkoutBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText} numberOfLines={1}>
                  Rasmiylashtirish
                </Text>
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
    alignItems: 'center',
  },
  scroll: { flex: 1, width: '100%' },
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
    paddingBottom: 12,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    lineHeight: 24,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  headerSub: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    textAlign: 'center',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnGhost: { width: 42, height: 42 },

  branchCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    marginBottom: 10,
  },
  branchCardWarn: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFEF8',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  branchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  branchBody: { flex: 1, minWidth: 0 },
  branchLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
    marginBottom: 2,
  },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  branchAddress: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  branchWarn: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: WARN,
  },
  branchHint: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  branchAction: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: LAVENDER,
  },
  branchActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  noticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: WARN,
  },

  empty: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 28,
    color: PURPLE_DEEP,
  },
  emptyHint: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 300,
  },

  list: { gap: 8 },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
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
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  itemBody: { flex: 1, minWidth: 0, paddingTop: 1 },
  itemName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  itemMeta: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  itemUnitPrice: {
    marginTop: 6,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 19,
    color: PURPLE,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  priceFlag: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: WARN,
  },
  stockOk: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: OK,
  },
  stockBad: {
    marginTop: 8,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: BAD,
  },
  stockWarnBlock: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  stockWarn: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: WARN,
  },
  stockWarnHint: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 48,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LAVENDER,
    borderRadius: 12,
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 2,
    flexShrink: 0,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 30,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  lineTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 20,
    color: PURPLE_DEEP,
    flexShrink: 1,
    maxWidth: '46%',
    textAlign: 'right',
  },
  controlDisabled: { opacity: 0.42 },

  summaryCard: {
    marginTop: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  summaryTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    flexShrink: 0,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 10,
  },
  summaryTotalLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  summaryTotalValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 20,
    color: PURPLE,
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryNote: {
    marginTop: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
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
  },
  footerInner: { gap: 10 },
  footerSum: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  footerSumLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  footerSumValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    lineHeight: 24,
    color: PURPLE_DEEP,
    flexShrink: 1,
    textAlign: 'right',
  },
  cta: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: YELLOW,
  },
  ctaBusy: {
    opacity: 0.72,
    borderBottomColor: 'transparent',
  },
  ctaText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    letterSpacing: 0.2,
  },

  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
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
    minHeight: 48,
    minWidth: 180,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: YELLOW,
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },

  skel: {
    backgroundColor: '#E6E1F2',
    borderRadius: 10,
  },
});
