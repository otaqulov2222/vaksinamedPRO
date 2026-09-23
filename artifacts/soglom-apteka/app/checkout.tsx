import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api, API_URL, newIdempotencyKey, type ApiError } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F5F4FA';
const CARD = '#FFFFFF';
const BORDER = '#E8E4F2';
const LAVENDER = '#F6F2FC';
const WARN = '#B45309';
const BAD = '#B91C1C';
const OK = '#3D7A55';

const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';
const FOCUS_FRESH_MS = 400;

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

function productIconName(icon: unknown) {
  const raw = typeof icon === 'string' ? icon : 'pill';
  return (
    raw in MaterialCommunityIcons.glyphMap ? raw : 'pill'
  ) as React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.skel, style]} />;
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, refresh, balance, syncCartCount } = useApp();
  const narrow = width < 380;
  const contentWidth = Math.min(width, 480);

  const [branchId, setBranchId] = useState<number | null>(null);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState('pay_at_branch');
  const [address, setAddress] = useState('');
  const [useCashback, setUseCashback] = useState(false);
  const [cart, setCart] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  const idempotencyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const loadGen = useRef(0);
  const lastFetchAt = useRef(0);
  const cartRef = useRef<any>(null);
  cartRef.current = cart;

  const applyCart = useCallback(
    (c: any) => {
      setCart(c);
      const id = c?.branch?.id ?? c?.cart?.branchId ?? null;
      setBranchId(id != null && Number.isFinite(Number(id)) ? Number(id) : null);
      syncCartCount(Array.isArray(c?.items) ? c.items.length : 0);
    },
    [syncCartCount],
  );

  const loadCheckout = useCallback(
    async (opts?: { force?: boolean; forceSkeleton?: boolean }) => {
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
      setLoadError(null);
      try {
        // Refresh profile balance + cart/rules together so cashback toggle sees real balance.
        const [, c, r] = await Promise.all([
          refresh(),
          api.cart(),
          api.cashbackRules().catch(() => null),
        ]);
        if (gen !== loadGen.current) return;
        applyCart(c);
        setRules(r);
        lastFetchAt.current = Date.now();
      } catch (error) {
        if (gen !== loadGen.current) return;
        if (!cartRef.current) {
          setLoadError(error instanceof Error ? error.message : 'Yuklanmadi');
          setCart(null);
        } else {
          toast('Xatolik', error instanceof Error ? error.message : 'Yangilab bo‘lmadi');
        }
      } finally {
        if (gen === loadGen.current) setLoading(false);
      }
    },
    [applyCart, refresh],
  );

  useFocusEffect(
    useCallback(() => {
      void loadCheckout({ force: true });
      return () => {
        loadGen.current += 1;
      };
    }, [loadCheckout]),
  );

  const openBranches = () => {
    router.push({ pathname: '/branches', params: { from: 'checkout' } });
  };

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const hasItems = items.length > 0;
  const selectedBranch = cart?.branch || null;

  const deliveryFeeKnown =
    fulfillment !== 'delivery' || (rules != null && typeof rules.deliveryFee === 'number');
  const deliveryFee =
    fulfillment === 'delivery' && deliveryFeeKnown ? Number(rules.deliveryFee) : 0;
  const goods = Number(cart?.subtotal) || 0;
  const balanceNum = Number(balance) || 0;
  const maxSpendRatio =
    typeof rules?.maxSpendRatio === 'number'
      ? rules.maxSpendRatio
      : typeof rules?.maxSpendPercent === 'number'
        ? rules.maxSpendPercent / 100
        : null;
  const spendCap =
    maxSpendRatio != null
      ? Math.max(0, Math.min(1, Number(maxSpendRatio)))
      : 0;
  // Show Cashback UI whenever the customer has a real positive balance on this order.
  // Do NOT hide the whole section if rules briefly fail — toggle still sends useCashback boolean.
  const showCashback = balanceNum > 0 && goods > 0;
  const cashbackPreview =
    useCashback && showCashback && spendCap > 0
      ? Math.min(balanceNum, Math.floor(goods * spendCap))
      : null;
  const cashbackUsed = cashbackPreview != null && cashbackPreview > 0 ? cashbackPreview : 0;
  const totalPreview = Math.max(0, goods + deliveryFee - cashbackUsed);

  const stockIssues = items.filter((item: any) => Boolean(item.stockInsufficient));

  const paymentOptions: Array<{ value: string; label: string; enabled: boolean; hint?: string }> = [
    {
      value: 'pay_at_branch',
      label: 'Filialda to‘lash',
      hint: 'Filialda to‘lov qilasiz',
      enabled: true,
    },
    ...(fulfillment === 'delivery'
      ? [
          {
            value: 'cod',
            label: t('payCod') || 'Yetkazib berganda to‘lash',
            hint: 'Yetkazib berganda to‘lov qilasiz',
            enabled: true,
          },
        ]
      : []),
    {
      value: 'payme',
      label: 'Payme',
      hint: 'Payme — hozircha mavjud emas',
      enabled: false,
    },
    {
      value: 'click',
      label: 'Click',
      hint: 'Click — hozircha mavjud emas',
      enabled: false,
    },
  ];

  const canSubmit =
    hasItems
    && branchId != null
    && !submitting
    && !(fulfillment === 'delivery' && !deliveryFeeKnown)
    && !(fulfillment === 'delivery' && address.trim().length < 8);

  const explainBlocked = () => {
    if (!hasItems) {
      toast('Savat', 'Savat bo‘sh');
      return;
    }
    if (!branchId) {
      toast('Filial', 'Buyurtma uchun filialni tanlang');
      return;
    }
    if (fulfillment === 'delivery' && !deliveryFeeKnown) {
      toast('Yetkazish', 'Yetkazish narxi serverdan yuklanmadi. Qayta urinib ko‘ring.');
      return;
    }
    if (fulfillment === 'delivery' && address.trim().length < 8) {
      toast('Manzil', 'Yetkazib berish manzilini kiriting');
      return;
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/cart');
  };

  const submit = async () => {
    if (submittingRef.current || submitting) return;
    if (!hasItems) {
      toast('Savat', 'Savat bo‘sh');
      return;
    }
    if (!branchId) {
      toast('Filial', 'Buyurtma uchun filialni tanlang');
      return;
    }
    if (fulfillment === 'delivery' && !deliveryFeeKnown) {
      toast('Yetkazish', 'Yetkazish narxi serverdan yuklanmadi. Qayta urinib ko‘ring.');
      return;
    }
    if (fulfillment === 'delivery' && address.trim().length < 8) {
      toast('Manzil', 'Yetkazib berish manzilini kiriting');
      return;
    }
    if (stockIssues.length) {
      const names = stockIssues
        .slice(0, 3)
        .map((item: any) => {
          const name = String(item.product?.nameUz || 'Mahsulot');
          const avail =
            item.available != null && Number.isFinite(Number(item.available))
              ? ` — mavjud: ${Number(item.available)}`
              : '';
          return `${name}${avail}`;
        })
        .join('\n');
      const proceed =
        Platform.OS === 'web'
          ? // eslint-disable-next-line no-alert
            window.confirm(
              `Ba’zi mahsulotlar tanlangan filialda yetarli emas.\n\n${names}\n\nDavom etasizmi? Yakuniy tekshiruv serverda.`,
            )
          : await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Qoldiq',
                `Ba’zi mahsulotlar tanlangan filialda yetarli emas.\n\n${names}\n\nYakuniy tekshiruv serverda.`,
                [
                  { text: 'Bekor', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Davom etish', onPress: () => resolve(true) },
                ],
              );
            });
      if (!proceed) return;
    }

    if (!idempotencyRef.current) {
      idempotencyRef.current = newIdempotencyKey('checkout');
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await api.setCartBranch(branchId);
      const result = await api.checkout(
        {
          branchId,
          fulfillment,
          paymentMethod,
          address,
          useCashback: Boolean(useCashback && showCashback),
        },
        { idempotencyKey: idempotencyRef.current },
      );
      const orderId = result?.order?.id;
      if (orderId == null) {
        throw Object.assign(new Error('Buyurtma ID serverdan kelmadi'), { code: 'ORDER_ID_MISSING' });
      }
      try {
        await AsyncStorage.removeItem(PRICE_SNAP_KEY);
      } catch {
        // ignore
      }
      await refresh();
      idempotencyRef.current = null;
      const checkoutUrl = result.payment?.checkoutUrl;
      if (checkoutUrl && (paymentMethod === 'payme' || paymentMethod === 'click')) {
        await Linking.openURL(`${API_URL}${checkoutUrl}`);
      }
      router.replace(`/order/${orderId}`);
    } catch (error) {
      const err = error as ApiError;
      const code = err.code || '';
      let title = 'Xatolik';
      let message = err.message || 'Buyurtma yuborilmadi';
      if (code === 'STOCK_UNAVAILABLE') {
        title = 'Qoldiq o‘zgardi';
        message =
          'Mahsulotlardan biri endi mavjud emas yoki yetarli emas. Savatni yangilab qayta urinib ko‘ring.';
      } else if (code === 'BRANCH_REQUIRED' || code === 'BRANCH_NOT_FOUND' || code === 'BRANCH_CLOSED') {
        title = 'Filial';
      } else if (code === 'INSUFFICIENT_CASHBACK' || code === 'SPEND_CAP_ZERO') {
        title = 'Cashback';
      } else if (code === 'CART_EMPTY') {
        title = 'Savat';
      } else if (code === 'ADDRESS_REQUIRED') {
        title = 'Manzil';
      }
      toast(title, message);
      await loadCheckout({ force: true });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12);
  const sidePad = narrow ? 14 : 20;
  // Measured sticky footer + breathing room so Click / last cards clear the CTA.
  const footerFallback = 12 + 28 + 10 + 52 + bottomPad;
  const scrollClearance = (footerHeight > 0 ? footerHeight : footerFallback) + 36;
  const maxSpendPercent = spendCap > 0 ? Math.round(spendCap * 100) : null;

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
      <Text style={styles.headerTitle} numberOfLines={1}>
        Rasmiylashtirish
      </Text>
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
          <SkeletonBlock style={{ height: 88, borderRadius: 16, width: '100%' }} />
          <SkeletonBlock style={{ height: 120, borderRadius: 16, width: '100%', marginTop: 12 }} />
          <SkeletonBlock style={{ height: 120, borderRadius: 16, width: '100%', marginTop: 12 }} />
          <SkeletonBlock style={{ height: 140, borderRadius: 16, width: '100%', marginTop: 12 }} />
        </ScrollView>
      </View>
    );
  }

  if (loadError && !cart) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <MaterialCommunityIcons name="cloud-off-outline" size={44} color={MUTED} />
          <Text style={styles.stateTitle}>Checkout yuklanmadi</Text>
          <Text style={styles.stateHint}>{loadError}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void loadCheckout({ force: true, forceSkeleton: true })}
            accessibilityRole="button"
            accessibilityLabel="Qayta urinish"
          >
            <Text style={styles.primaryBtnText}>Qayta urinish</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (cart && !hasItems) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <View style={styles.emptyIcon}>
            <Feather name="shopping-cart" size={28} color={PURPLE} />
          </View>
          <Text style={styles.stateTitle}>Savatingiz bo‘sh</Text>
          <Text style={styles.stateHint}>Buyurtma berish uchun avval mahsulot tanlang.</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
            accessibilityRole="button"
            accessibilityLabel="Katalogga o‘tish"
          >
            <Text style={styles.primaryBtnText}>Katalogga o‘tish</Text>
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
            paddingBottom: hasItems ? 8 : 24 + bottomPad,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.pageHint}>
          Yakuniy narx, qoldiq va to‘lov holati buyurtma vaqtida serverda tasdiqlanadi.
        </Text>

        {/* Branch — same /branches picker as Cart */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Filial</Text>
          {selectedBranch?.name ? (
            <>
              <Text style={styles.branchName} numberOfLines={2}>
                {String(selectedBranch.name)}
              </Text>
              {selectedBranch.address ? (
                <Text style={styles.branchMeta} numberOfLines={2}>
                  {String(selectedBranch.address)}
                </Text>
              ) : null}
              {selectedBranch.hours ? (
                <Text style={styles.branchMeta} numberOfLines={1}>
                  {String(selectedBranch.hours)}
                </Text>
              ) : null}
              <Pressable
                style={styles.linkBtn}
                onPress={openBranches}
                accessibilityRole="button"
                accessibilityLabel="Filialni o‘zgartirish"
              >
                <Text style={styles.linkBtnText}>O‘zgartirish</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.warnText}>Filial tanlanmagan</Text>
              <Pressable
                style={[styles.primaryBtn, { marginTop: 12, alignSelf: 'stretch' }]}
                onPress={openBranches}
                accessibilityRole="button"
                accessibilityLabel="Filial tanlash"
              >
                <Text style={styles.primaryBtnText}>Filial tanlash</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Stock preflight */}
        {stockIssues.length ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Ba’zi mahsulotlar tanlangan filialda yetarli emas.</Text>
            {stockIssues.map((item: any) => {
              const name = String(item.product?.nameUz || 'Mahsulot');
              const avail =
                item.available != null && Number.isFinite(Number(item.available))
                  ? Number(item.available)
                  : null;
              return (
                <Text key={item.id} style={styles.warnLine} numberOfLines={2}>
                  {name}
                  {avail != null ? ` — mavjud: ${avail}` : ''}
                </Text>
              );
            })}
            <Text style={styles.warnNote}>Yakuniy qoldiq tekshiruvi buyurtmada (server).</Text>
          </View>
        ) : null}

        {/* Order lines */}
        <Text style={styles.sectionTitle}>Buyurtma tarkibi</Text>
        {items.map((item: any) => {
          const product = item.product || {};
          const name = String(product.nameUz || product.nameRu || 'Mahsulot');
          const qty = Math.max(1, Number(item.quantity) || 1);
          const unitPrice = Number(item.unitPrice ?? product.price ?? 0);
          const lineTotal = Number(item.lineTotal ?? unitPrice * qty);
          return (
            <View key={item.id} style={styles.lineCard}>
              <View
                style={styles.lineIcon}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <MaterialCommunityIcons
                  name={productIconName(product.icon)}
                  size={26}
                  color={PURPLE}
                />
              </View>
              <View style={styles.lineBody}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {name}
                </Text>
                <View style={styles.lineBottom}>
                  <Text style={styles.lineMeta} numberOfLines={1}>
                    {qty} dona × {priceUz(unitPrice)}
                  </Text>
                  <Text style={styles.lineTotal} numberOfLines={1}>
                    {priceUz(lineTotal)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Fulfillment */}
        <Text style={styles.sectionTitle}>Olish usuli</Text>
        <View style={styles.pillRow}>
          <Pressable
            style={[styles.pill, fulfillment === 'pickup' && styles.pillActive]}
            onPress={() => {
              setFulfillment('pickup');
              if (paymentMethod === 'cod') setPaymentMethod('pay_at_branch');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: fulfillment === 'pickup' }}
            accessibilityLabel="Filialdan olib ketish"
          >
            <Text style={[styles.pillText, fulfillment === 'pickup' && styles.pillTextActive]}>
              Filialdan olib ketish
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, fulfillment === 'delivery' && styles.pillActive]}
            onPress={() => setFulfillment('delivery')}
            accessibilityRole="button"
            accessibilityState={{ selected: fulfillment === 'delivery' }}
            accessibilityLabel="Yetkazib berish"
          >
            <Text style={[styles.pillText, fulfillment === 'delivery' && styles.pillTextActive]}>
              Yetkazib berish
            </Text>
          </Pressable>
        </View>
        {fulfillment === 'delivery' ? (
          <>
            <Text style={styles.inlineHint}>
              Ichki yetkazib berish. Tashqi kuryer shartnomasi hali yo‘q.
            </Text>
            <Text style={styles.fieldLabel}>Yetkazib berish manzili</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Tuman, ko‘cha, uy"
              placeholderTextColor={MUTED}
              style={styles.input}
              accessibilityLabel="Yetkazib berish manzili"
            />
            {!deliveryFeeKnown ? (
              <Text style={styles.inlineHint}>Yetkazish narxi yuklanmoqda yoki mavjud emas.</Text>
            ) : null}
          </>
        ) : null}

        {/* Cashback */}
        {showCashback ? (
          <>
            <Text style={styles.sectionTitle}>Cashback</Text>
            <View style={styles.cashbackCard}>
              <Pressable
                onPress={() => setUseCashback(!useCashback)}
                style={styles.cashbackRow}
                accessibilityRole="switch"
                accessibilityState={{ checked: useCashback }}
                accessibilityLabel="Cashbackdan foydalanish"
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cashbackTitle}>Cashbackdan foydalanish</Text>
                  <Text style={styles.cashbackMeta} numberOfLines={2}>
                    Mavjud: {priceUz(balanceNum)}
                    {maxSpendPercent != null ? ` · max ${maxSpendPercent}%` : ''}
                  </Text>
                  {useCashback && cashbackUsed > 0 ? (
                    <Text style={styles.cashbackPreview}>
                      Cashback: −{priceUz(cashbackUsed)}
                    </Text>
                  ) : useCashback ? (
                    <Text style={styles.cashbackMeta}>Yakuniy cashback serverda hisoblanadi</Text>
                  ) : null}
                </View>
                <View
                  style={[styles.toggleTrack, useCashback && styles.toggleTrackOn]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <View style={[styles.toggleThumb, useCashback && styles.toggleThumbOn]} />
                </View>
              </Pressable>
              {maxSpendPercent != null ? (
                <Text style={styles.cashbackHint}>
                  Buyurtmaning ko‘pi bilan {maxSpendPercent}% qismini cashback bilan to‘lashingiz mumkin.
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Payment */}
        <Text style={styles.sectionTitle}>To‘lov</Text>
        {paymentOptions.map((opt) => {
          const selected = paymentMethod === opt.value && opt.enabled;
          if (!opt.enabled) {
            return (
              <View
                key={opt.value}
                style={[styles.optionRow, styles.optionDisabled]}
                accessibilityRole="text"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={`${opt.label}. ${opt.hint || 'Hozircha mavjud emas'}`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.optionTitle, styles.optionTitleDisabled]} numberOfLines={2}>
                    {opt.label}
                  </Text>
                  {opt.hint ? (
                    <Text style={[styles.optionMeta, styles.optionMetaDisabled]} numberOfLines={2}>
                      {opt.hint}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPaymentMethod(opt.value)}
              style={[styles.optionRow, selected && styles.optionRowActive]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: false }}
              accessibilityLabel={`${opt.label}. ${opt.hint || ''}`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.optionTitle} numberOfLines={2}>
                  {opt.label}
                </Text>
                {opt.hint ? (
                  <Text style={styles.optionMeta} numberOfLines={2}>
                    {opt.hint}
                  </Text>
                ) : null}
              </View>
              {selected ? <Feather name="check" size={20} color={PURPLE} /> : null}
            </Pressable>
          );
        })}

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Hisob (taxminiy)</Text>
          <SummaryRow label="Mahsulotlar" value={priceUz(goods)} />
          {fulfillment === 'delivery' ? (
            deliveryFeeKnown ? (
              <SummaryRow label="Yetkazib berish" value={priceUz(deliveryFee)} />
            ) : (
              <SummaryRow label="Yetkazib berish" value="Noma’lum" warn />
            )
          ) : null}
          {useCashback && cashbackUsed > 0 ? (
            <SummaryRow label="Cashback" value={`− ${priceUz(cashbackUsed)}`} warn />
          ) : null}
          <View style={styles.summaryDivider} />
          <SummaryRow label="Jami (taxminiy)" value={priceUz(totalPreview)} bold />
          <Text style={styles.summaryNote}>
            Qiymatlar taxminiy. Yakuniy summa va cashback serverda.
          </Text>
        </View>

        {hasItems ? (
          <View
            style={{ height: scrollClearance }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </ScrollView>

      {hasItems ? (
        <View
          style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}
          onLayout={(e) => {
            const h = Math.ceil(e.nativeEvent.layout.height);
            if (h > 0 && Math.abs(h - footerHeight) > 1) setFooterHeight(h);
          }}
        >
          <View style={[styles.footerInner, { maxWidth: contentWidth - sidePad * 2, width: '100%' }]}>
            <View style={styles.footerSum}>
              <Text style={styles.footerSumLabel}>Jami (taxminiy)</Text>
              <Text style={styles.footerSumValue} numberOfLines={1}>
                {priceUz(totalPreview)}
              </Text>
            </View>
            <Pressable
              style={[styles.cta, (!canSubmit || submitting) && styles.ctaDisabled]}
              disabled={submitting}
              onPress={() => {
                if (submittingRef.current || submitting) return;
                if (!canSubmit) {
                  explainBlocked();
                  return;
                }
                void submit();
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit || submitting }}
              accessibilityLabel="Buyurtmani tasdiqlash"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText} numberOfLines={1}>
                  Buyurtmani tasdiqlash
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  warn,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  warn?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.summaryBold]} numberOfLines={2}>
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          bold && styles.summaryBold,
          warn && { color: WARN },
          muted && { color: MUTED },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: { alignSelf: 'center', paddingTop: 10 },

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
    fontSize: 17,
    color: PURPLE_DEEP,
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

  pageHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
    marginBottom: 12,
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    marginBottom: 12,
  },
  cardLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    marginBottom: 6,
  },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  branchMeta: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  linkBtn: { marginTop: 10, alignSelf: 'flex-start' },
  linkBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  warnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: WARN,
    marginBottom: 8,
  },

  warnCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  warnTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: WARN,
    marginBottom: 6,
  },
  warnLine: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: BAD,
    marginTop: 2,
  },
  warnNote: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },

  sectionTitle: {
    marginTop: 4,
    marginBottom: 8,
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },

  lineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  lineIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBody: { flex: 1, minWidth: 0 },
  lineName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  lineBottom: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lineMeta: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  lineTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE,
    flexShrink: 0,
    textAlign: 'right',
  },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  pillActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  pillTextActive: { color: '#fff' },
  fieldLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    marginBottom: 6,
  },
  inlineHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    marginBottom: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: CARD,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: PURPLE_DEEP,
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  optionRowActive: {
    borderColor: PURPLE,
    backgroundColor: '#F8F4FF',
    borderWidth: 2,
  },
  optionDisabled: {
    opacity: 1,
    backgroundColor: '#F1EEF6',
    borderColor: '#E2DDEA',
    borderWidth: 1,
  },
  optionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  optionTitleDisabled: { color: '#9AA0B0' },
  optionMeta: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  optionMetaDisabled: { color: '#A8AEBC' },

  cashbackCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    marginBottom: 12,
  },
  cashbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashbackTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  cashbackMeta: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
  },
  cashbackPreview: {
    marginTop: 6,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: OK,
  },
  cashbackHint: {
    marginTop: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
  },
  toggleTrack: {
    width: 48,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8E4F2',
    padding: 3,
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleTrackOn: { backgroundColor: PURPLE },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  summaryCard: {
    marginTop: 8,
    marginBottom: 8,
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
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    flex: 1,
    minWidth: 0,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE_DEEP,
    maxWidth: '48%',
    textAlign: 'right',
  },
  summaryBold: { fontFamily: 'Inter_700Bold', color: PURPLE_DEEP, fontSize: 15 },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 6,
  },
  summaryNote: {
    marginTop: 6,
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  ctaDisabled: { opacity: 0.5 },
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
    fontSize: 18,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  stateHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
  skel: { backgroundColor: '#E6E1F2', borderRadius: 10 },
});
