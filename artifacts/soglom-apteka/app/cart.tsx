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
const BG = '#F5F4FA';
const CARD = '#FFFFFF';
const BORDER = '#E8E4F2';
const LAVENDER = '#F6F2FC';
const OK = '#3D7A55';
const BAD = '#B91C1C';
const WARN = '#B45309';

const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';
const FOCUS_FRESH_MS = 400;

type PriceSnap = Record<string, number>;
type BusyAction = 'inc' | 'dec' | 'remove';
type PreflightChoice = 'continue' | 'branch' | 'cancel';

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

function askPreflight(opts: {
  title: string;
  message: string;
  continueLabel: string;
  branchLabel?: string;
}): Promise<PreflightChoice> {
  const { title, message, continueLabel, branchLabel } = opts;
  if (Platform.OS === 'web') {
    if (branchLabel) {
      // eslint-disable-next-line no-alert
      const goBranch = window.confirm(`${title}\n\n${message}\n\nOK — ${branchLabel}\nCancel — ${continueLabel}`);
      return Promise.resolve(goBranch ? 'branch' : 'continue');
    }
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`${title}\n\n${message}\n\nOK — ${continueLabel}\nCancel — Bekor`);
    return Promise.resolve(ok ? 'continue' : 'cancel');
  }
  return new Promise((resolve) => {
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive' | 'default'; onPress: () => void }> = [
      { text: 'Bekor', style: 'cancel', onPress: () => resolve('cancel') },
    ];
    if (branchLabel) {
      buttons.push({ text: branchLabel, onPress: () => resolve('branch') });
    }
    buttons.push({ text: continueLabel, onPress: () => resolve('continue') });
    Alert.alert(title, message, buttons);
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
    if (!Number.isFinite(id) || nextQty < 1) return;
    if (!beginItemBusy(id, action)) return;
    try {
      const data = await api.updateCartItem(id, nextQty);
      await applyPayload(data);
    } catch (e) {
      const err = e as ApiError;
      toast(
        err.code === 'STOCK_UNAVAILABLE' ? 'Qoldiq' : 'Xatolik',
        err.message || 'Miqdor yangilanmadi',
      );
      await load({ forceSkeleton: false, force: true });
    } finally {
      endItemBusy(id);
    }
  };

  const removeItem = async (item: any) => {
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
        const choice = await askPreflight({
          title: 'Filial',
          message:
            'Filial tanlanmagan. Buyurtmani rasmiylashtirishdan oldin filialni tanlang.',
          continueLabel: 'Davom etish',
          branchLabel: 'Filial tanlash',
        });
        if (choice === 'cancel') return;
        if (choice === 'branch') {
          router.push({ pathname: '/branches', params: { from: 'cart' } });
          return;
        }
      }

      const stockIssue = items.some((item: any) => Boolean(item.stockInsufficient));
      if (stockIssue) {
        const choice = await askPreflight({
          title: 'Qoldiq',
          message: 'Ba’zi mahsulotlar tanlangan filialda yetarli emas.',
          continueLabel: 'Davom etish',
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
  const footerReserve = hasItems ? 24 + 100 + bottomPad : 24 + bottomPad;
  const subtotalLabel = priceUz(Number(cart?.subtotal) || 0);

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
        {hasItems ? (
          <Text style={styles.headerSub} numberOfLines={1}>
            {items.length} ta tur
          </Text>
        ) : null}
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
          <SkeletonBlock style={{ height: 72, borderRadius: 16, width: '100%' }} />
          <SkeletonBlock style={{ height: 110, borderRadius: 16, width: '100%', marginTop: 12 }} />
          <SkeletonBlock style={{ height: 110, borderRadius: 16, width: '100%', marginTop: 12 }} />
          <SkeletonBlock style={{ height: 64, borderRadius: 16, width: '100%', marginTop: 16 }} />
        </ScrollView>
      </View>
    );
  }

  if (error && !cart) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <MaterialCommunityIcons name="cloud-off-outline" size={44} color={MUTED} />
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
        <View style={styles.branchCard}>
          <Text style={styles.branchLabel}>Filial</Text>
          {cart?.branch?.name ? (
            <>
              <Text style={styles.branchName} numberOfLines={2}>
                {String(cart.branch.name)}
              </Text>
              {cart.branch.address ? (
                <Text style={styles.branchAddress} numberOfLines={2}>
                  {String(cart.branch.address)}
                </Text>
              ) : null}
              <Pressable
                style={styles.branchLink}
                onPress={() => router.push({ pathname: '/branches', params: { from: 'cart' } })}
                accessibilityRole="button"
                accessibilityLabel="Filial tanlash"
              >
                <Text style={styles.branchLinkText}>Filialni o‘zgartirish</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.branchWarn}>Filial tanlanmagan</Text>
              <Text style={styles.branchHint}>Qoldiq filial tanlangandan keyin ko‘rsatiladi.</Text>
              <Pressable
                style={styles.branchBtn}
                onPress={() => router.push({ pathname: '/branches', params: { from: 'cart' } })}
                accessibilityRole="button"
                accessibilityLabel="Filial tanlash"
              >
                <Feather name="map-pin" size={14} color={PURPLE} />
                <Text style={styles.branchBtnText}>Filial tanlash</Text>
              </Pressable>
            </>
          )}
        </View>

        {notices.map((n, i) => (
          <View key={`${n.code}-${i}`} style={styles.notice}>
            <Text style={styles.noticeText}>{n.message}</Text>
          </View>
        ))}

        {!hasItems ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="shopping-cart" size={28} color={PURPLE} />
            </View>
            <Text style={styles.emptyTitle}>Savatingiz bo‘sh</Text>
            <Text style={styles.emptyHint}>Kerakli dorilarni toping va savatingizga qo‘shing.</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
              accessibilityRole="button"
              accessibilityLabel="Katalogga o‘tish"
            >
              <Text style={styles.primaryBtnText}>Katalogga o‘tish</Text>
            </Pressable>
          </View>
        ) : (
          items.map((item: any) => {
            const product = item.product || {};
            const name = String(product.nameUz || product.nameRu || 'Mahsulot');
            const manufacturer = String(product.manufacturer || '').trim();
            const unit = String(product.unit || '').trim();
            const unitPrice = Number(item.unitPrice ?? product.price ?? 0);
            const lineTotal = Number(item.lineTotal ?? unitPrice * Number(item.quantity || 0));
            const qty = Math.max(1, Number(item.quantity) || 1);
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
            const plusDisabled =
              itemBusy || (availableKnownQty != null && qty >= availableKnownQty);

            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Pressable
                    style={styles.productHit}
                    onPress={() => openProduct(product)}
                    accessibilityRole="button"
                    accessibilityLabel="Mahsulotni ko‘rish"
                  >
                    <View
                      style={styles.itemIcon}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <MaterialCommunityIcons
                        name={productIconName(product.icon)}
                        size={28}
                        color={PURPLE}
                      />
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {name}
                      </Text>
                      {manufacturer ? (
                        <Text style={styles.itemMeta} numberOfLines={1}>
                          {manufacturer}
                        </Text>
                      ) : null}
                      {unit ? (
                        <Text style={styles.itemUnit} numberOfLines={1}>
                          {unit}
                        </Text>
                      ) : null}
                      <Text style={styles.itemUnitPrice}>{priceUz(unitPrice)}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[styles.removeBtn, itemBusy && styles.controlDisabled]}
                    onPress={() => void removeItem(item)}
                    disabled={itemBusy}
                    accessibilityRole="button"
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
                  <Text style={styles.priceFlag}>
                    Narx o‘zgargan: {priceUz(flag.previous)} → {priceUz(flag.current)}
                  </Text>
                ) : null}

                {item.stockInsufficient ? (
                  <Text style={styles.stockBad}>
                    Mavjud miqdor o‘zgargan
                    {availableKnownQty != null ? ` (mavjud: ${availableKnownQty} dona)` : ''}
                  </Text>
                ) : availableKnownQty != null ? (
                  <Text style={styles.stockOk}>Mavjud: {availableKnownQty} dona</Text>
                ) : !known ? (
                  <Text style={styles.stockWarn}>Filial tanlanmagan</Text>
                ) : null}

                <View style={styles.cardFooter}>
                  <View style={styles.qtyWrap}>
                    <Pressable
                      style={[styles.qtyBtn, (qty <= 1 || itemBusy) && styles.controlDisabled]}
                      onPress={() => void changeQty(item, qty - 1, 'dec')}
                      disabled={qty <= 1 || itemBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Mahsulot sonini kamaytirish"
                    >
                      {busyAction === 'dec' ? (
                        <ActivityIndicator size="small" color={PURPLE_DEEP} />
                      ) : (
                        <Feather name="minus" size={16} color={PURPLE_DEEP} />
                      )}
                    </Pressable>
                    <Text style={styles.qtyValue} accessibilityLabel={`Miqdor ${qty}`}>
                      {qty}
                    </Text>
                    <Pressable
                      style={[styles.qtyBtn, plusDisabled && styles.controlDisabled]}
                      onPress={() => void changeQty(item, qty + 1, 'inc')}
                      disabled={plusDisabled}
                      accessibilityRole="button"
                      accessibilityLabel="Mahsulot sonini oshirish"
                    >
                      {busyAction === 'inc' ? (
                        <ActivityIndicator size="small" color={PURPLE_DEEP} />
                      ) : (
                        <Feather name="plus" size={16} color={PURPLE_DEEP} />
                      )}
                    </Pressable>
                  </View>
                  <Text style={styles.lineTotal} numberOfLines={1}>
                    {priceUz(lineTotal)}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {hasItems ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Savat xulosasi</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Mahsulot turlari</Text>
              <Text style={styles.summaryValue}>{items.length} ta</Text>
            </View>
            <Text style={styles.summaryNote}>
              Oraliq jami sticky pastda. Cashback va yetkazish — rasmiylashtirishda. Yakuniy hisob
              serverda.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {hasItems ? (
        <View style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}>
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
              accessibilityLabel="Savatni rasmiylashtirish"
            >
              {checkoutBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText} numberOfLines={1}>
                  Savatni rasmiylashtirish
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
    paddingBottom: 10,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  headerSub: {
    marginTop: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
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
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    marginBottom: 12,
  },
  branchLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    marginBottom: 4,
  },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  branchAddress: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  branchWarn: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: WARN,
  },
  branchHint: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  branchBtn: {
    marginTop: 10,
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
  branchLink: { marginTop: 8, alignSelf: 'flex-start' },
  branchLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },

  notice: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  noticeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: WARN,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: PURPLE_DEEP,
  },
  emptyHint: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
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
  },
  itemBody: { flex: 1, minWidth: 0 },
  itemName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
    minHeight: 38,
  },
  itemMeta: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  itemUnit: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  itemUnitPrice: {
    marginTop: 6,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  priceFlag: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: WARN,
  },
  stockOk: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: OK,
  },
  stockBad: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: BAD,
  },
  stockWarn: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: WARN,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LAVENDER,
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  lineTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    flexShrink: 1,
    maxWidth: '48%',
    textAlign: 'right',
  },
  controlDisabled: { opacity: 0.45 },

  summaryCard: {
    marginTop: 6,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  summaryTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  summaryLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  summaryNote: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
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
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  footerInner: { gap: 10 },
  footerSum: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerSumLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  footerSumValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE,
    flexShrink: 1,
  },
  cta: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  ctaBusy: { opacity: 0.75 },
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
    gap: 8,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  stateHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 14,
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

  skel: {
    backgroundColor: '#E6E1F2',
    borderRadius: 10,
  },
});
