import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { localizedName } from '@/lib/i18n/data';
import { api, API_URL, newIdempotencyKey, type ApiError } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import type { TranslationKey } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';
import { fulfillmentTypeLabel, paymentMethodLabel } from '@/lib/orderLabels';
import DeliveryMapPickerModal from '@/components/DeliveryMapPickerModal';
import type { DeliveryAddressSelection, LatLng } from '@/lib/maps';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F3F1F7';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const WARN = '#B45309';
const BAD = '#B91C1C';
const OK = '#3D7A55';
const YELLOW = '#FFCC00';

const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';
const FOCUS_FRESH_MS = 400;

/**
 * Honest delivery timing — not an ETA. Sent as optional `window` so server does not store "Bugun 10:00 — 18:00".
 * API value: keep in Uzbek and untranslated; the UI shows `cart.checkoutDeliveryTiming` instead.
 */
const DELIVERY_TIMING_HONEST = 'Yetkazib berish vaqti buyurtma tasdiqlangach aniqlanadi'; // i18n-ignore: API payload value
const MIN_ADDRESS_LENGTH = 8;

/** Localized fallback per checkout error code; Uzbek UI still shows the server message when present. */
const CHECKOUT_ERROR_FALLBACK: Record<string, TranslationKey> = {
  BRANCH_REQUIRED: 'cart.checkoutBranchRequired',
  BRANCH_NOT_FOUND: 'cart.checkoutBranchNotFound',
  BRANCH_CLOSED: 'cart.checkoutBranchClosed',
  INSUFFICIENT_CASHBACK: 'cart.checkoutCashbackInsufficient',
  SPEND_CAP_ZERO: 'cart.checkoutCashbackCapZero',
  CART_EMPTY: 'cart.cartEmptyTitle',
  ADDRESS_REQUIRED: 'cart.checkoutAddressRequired',
};

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
  const { t, fmt, language, refresh, balance, syncCartCount } = useApp();
  const narrow = width < 380;
  const contentWidth = Math.min(width, 480);

  const [branchId, setBranchId] = useState<number | null>(null);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState('pay_at_branch');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrHouse, setAddrHouse] = useState('');
  const [addrApartment, setAddrApartment] = useState('');
  const [addrEntrance, setAddrEntrance] = useState('');
  const [addrFloor, setAddrFloor] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrComment, setAddrComment] = useState('');
  const [addrCoords, setAddrCoords] = useState<LatLng | null>(null);
  const [mapAddressResolved, setMapAddressResolved] = useState<string>('');
  const [showMapPicker, setShowMapPicker] = useState(false);
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
          setLoadError(localizeError(error, t));
          setCart(null);
        } else {
          notify(t('common.errorTitle'), localizeError(error, t, { fallback: 'cart.checkoutRefreshFailed' }));
        }
      } finally {
        if (gen === loadGen.current) setLoading(false);
      }
    },
    [applyCart, refresh, t],
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

  const paymentOptions: Array<{ value: string; label: string; enabled: boolean; hint?: string }> = (
    fulfillment === 'delivery'
      ? [
          {
            value: 'payme',
            label: t('cart.checkoutOnlinePayment'),
            hint: t('cart.checkoutOnlinePaymentHint'),
            enabled: true,
          },
        ]
      : [
          {
            value: 'pay_at_branch',
            label: paymentMethodLabel(t, 'pay_at_branch'),
            hint: t('cart.checkoutPayAtBranchHint'),
            enabled: true,
          },
        ]
  ).filter((opt) => opt.enabled);

  const handleMapConfirm = useCallback((selection: DeliveryAddressSelection) => {
    setAddrCoords({ lat: selection.latitude, lng: selection.longitude });
    const rawCoordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/;
    const addr = selection.formattedAddress?.trim() || '';
    if (addr && !rawCoordPattern.test(addr)) {
      setMapAddressResolved(addr);
    } else {
      setMapAddressResolved('');
    }
    if (selection.district) setAddrDistrict(selection.district);
    if (selection.street) setAddrStreet(selection.street);
    if (selection.house) setAddrHouse(selection.house);
  }, []);

  // Structured address assembly for canonical delivery payload
  const formattedAddress = useMemo(() => {
    const parts: string[] = [];
    const rawCoordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/;
    const housePart = addrHouse.trim() ? `${addrHouse.trim()}-uy` : ''; // i18n-ignore
    if (mapAddressResolved.trim() && !rawCoordPattern.test(mapAddressResolved.trim())) {
      const resolved = mapAddressResolved.trim();
      if (housePart && !resolved.includes(addrHouse.trim())) {
        parts.push(`${resolved}, ${housePart}`);
      } else {
        parts.push(resolved);
      }
    } else {
      const mainParts = [addrDistrict.trim(), addrStreet.trim(), housePart].filter(Boolean); // i18n-ignore
      if (mainParts.length) parts.push(mainParts.join(', '));
    }
    const extraParts = [
      addrApartment.trim() ? `${addrApartment.trim()}-xonadon` : '', // i18n-ignore
      addrEntrance.trim() ? `${addrEntrance.trim()}-kirish` : '', // i18n-ignore
      addrFloor.trim() ? `${addrFloor.trim()}-qavat` : '', // i18n-ignore
    ].filter(Boolean);
    if (extraParts.length) parts.push(extraParts.join(', '));
    if (addrLandmark.trim()) parts.push(`Mo‘ljal: ${addrLandmark.trim()}`); // i18n-ignore
    if (addrComment.trim()) parts.push(`Izoh: ${addrComment.trim()}`); // i18n-ignore
    return parts.join(' | ');
  }, [mapAddressResolved, addrDistrict, addrStreet, addrHouse, addrApartment, addrEntrance, addrFloor, addrLandmark, addrComment]);

  const hasValidDeliveryAddress =
    (
      (Boolean(mapAddressResolved.trim()) && addrHouse.trim().length > 0) ||
      (addrDistrict.trim().length > 0 && addrStreet.trim().length > 0 && addrHouse.trim().length > 0)
    ) && formattedAddress.length >= MIN_ADDRESS_LENGTH;

  const canSubmit =
    hasItems
    && branchId != null
    && !submitting
    && !(fulfillment === 'delivery' && !deliveryFeeKnown)
    && !(fulfillment === 'delivery' && !hasValidDeliveryAddress);

  const explainBlocked = () => {
    if (!hasItems) {
      notify(t('common.navCart'), t('cart.cartEmptyTitle'));
      return;
    }
    if (!branchId) {
      notify(t('cart.branchLabel'), t('cart.checkoutBranchRequired'));
      return;
    }
    if (fulfillment === 'delivery' && !deliveryFeeKnown) {
      notify(t('cart.checkoutDeliveryTitle'), t('cart.checkoutDeliveryFeeFailed'));
      return;
    }
    if (fulfillment === 'delivery' && !hasValidDeliveryAddress) {
      const hasBaseLocation = Boolean(mapAddressResolved.trim()) || (addrDistrict.trim().length > 0 && addrStreet.trim().length > 0);
      if (hasBaseLocation && !addrHouse.trim()) {
        notify(t('cart.checkoutAddressTitle'), t('cart.checkoutHouseRequired'));
        return;
      }
      notify(t('cart.checkoutAddressTitle'), t('cart.checkoutAddressRequired'));
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
      notify(t('common.navCart'), t('cart.cartEmptyTitle'));
      return;
    }
    if (!branchId) {
      notify(t('cart.branchLabel'), t('cart.checkoutBranchRequired'));
      return;
    }
    if (fulfillment === 'delivery' && !deliveryFeeKnown) {
      notify(t('cart.checkoutDeliveryTitle'), t('cart.checkoutDeliveryFeeFailed'));
      return;
    }
    if (fulfillment === 'delivery' && !hasValidDeliveryAddress) {
      notify(t('cart.checkoutAddressTitle'), t('cart.checkoutAddressRequired'));
      return;
    }
    if (stockIssues.length) {
      const names = stockIssues
        .slice(0, 3)
        .map((item: any) => {
          const name = (localizedName(language, item.product) || t('cart.productFallbackName'));
          const avail =
            item.available != null && Number.isFinite(Number(item.available))
              ? ` — ${t('cart.checkoutStockAvailableShort', { count: Number(item.available) })}`
              : '';
          return `${name}${avail}`;
        })
        .join('\n');
      const proceed = await confirmAction({
        title: t('cart.stockTitle'),
        message: `${t('cart.stockShortMessage')}\n\n${names}\n\n${t('cart.checkoutStockConfirmQuestion')}`,
        confirmText: t('common.continue'),
        cancelText: t('common.cancel'),
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
          address: formattedAddress,
          useCashback: Boolean(useCashback && showCashback),
          // Existing optional field — honest label, not a scheduled ETA/window.
          ...(fulfillment === 'delivery' ? { window: DELIVERY_TIMING_HONEST } : {}),
        },
        { idempotencyKey: idempotencyRef.current },
      );
      const orderId = result?.order?.id;
      if (orderId == null) {
        throw Object.assign(new Error('Order ID missing in checkout response'), { code: 'ORDER_ID_MISSING' });
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
      let title = t('common.errorTitle');
      const message = localizeError(err, t, {
        byCode: {
          STOCK_UNAVAILABLE: 'cart.checkoutStockChangedMessage',
          ORDER_ID_MISSING: 'cart.checkoutOrderIdMissing',
        },
        fallback: CHECKOUT_ERROR_FALLBACK[code] ?? 'cart.checkoutFailed',
      });
      if (code === 'STOCK_UNAVAILABLE') {
        title = t('cart.checkoutStockChangedTitle');
      } else if (code === 'BRANCH_REQUIRED' || code === 'BRANCH_NOT_FOUND' || code === 'BRANCH_CLOSED') {
        title = t('cart.branchLabel');
      } else if (code === 'INSUFFICIENT_CASHBACK' || code === 'SPEND_CAP_ZERO') {
        title = t('common.navCashback');
      } else if (code === 'CART_EMPTY') {
        title = t('common.navCart');
      } else if (code === 'ADDRESS_REQUIRED') {
        title = t('cart.checkoutAddressTitle');
      }
      notify(title, message);
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
        accessibilityLabel={t('common.back')}
      >
        <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {t('common.navCheckout')}
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
          <Text style={styles.stateTitle}>{t('cart.checkoutLoadFailed')}</Text>
          <Text style={styles.stateHint}>{loadError}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void loadCheckout({ force: true, forceSkeleton: true })}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.primaryBtnText}>{t('common.retry')}</Text>
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
          <Text style={styles.stateTitle}>{t('cart.checkoutEmptyTitle')}</Text>
          <Text style={styles.stateHint}>{t('cart.checkoutEmptyHint')}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
            accessibilityRole="button"
            accessibilityLabel={t('cart.checkoutGoToCatalog')}
          >
            <Text style={styles.primaryBtnText}>{t('cart.checkoutGoToCatalog')}</Text>
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
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Branch — same /branches picker as Cart */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('cart.branchLabel')}</Text>
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
                accessibilityLabel={t('cart.changeBranchA11y')}
              >
                <Text style={styles.linkBtnText}>{t('cart.change')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.warnText}>{t('cart.branchNotSelected')}</Text>
              <Pressable
                style={[styles.primaryBtn, { marginTop: 12, alignSelf: 'stretch' }]}
                onPress={openBranches}
                accessibilityRole="button"
                accessibilityLabel={t('cart.chooseBranch')}
              >
                <Text style={styles.primaryBtnText}>{t('cart.chooseBranch')}</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Stock preflight */}
        {stockIssues.length ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>{t('cart.stockShortMessage')}</Text>
            {stockIssues.map((item: any) => {
              const name = (localizedName(language, item.product) || t('cart.productFallbackName'));
              const avail =
                item.available != null && Number.isFinite(Number(item.available))
                  ? Number(item.available)
                  : null;
              return (
                <Text key={item.id} style={styles.warnLine} numberOfLines={2}>
                  {name}
                  {avail != null ? ` — ${t('cart.checkoutStockAvailableShort', { count: avail })}` : ''}
                </Text>
              );
            })}
            <Text style={styles.warnNote}>{t('cart.checkoutStockNote')}</Text>
          </View>
        ) : null}

        {/* Order lines */}
        <Text style={styles.sectionTitle}>{t('cart.checkoutOrderItems')}</Text>
        {items.map((item: any) => {
          const product = item.product || {};
          const name = (localizedName(language, product) || t('cart.productFallbackName'));
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
                    {t('cart.checkoutLineMeta', { qty, price: fmt.money(unitPrice) })}
                  </Text>
                  <Text style={styles.lineTotal} numberOfLines={1}>
                    {fmt.money(lineTotal)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Fulfillment */}
        <Text style={styles.sectionTitle}>{t('cart.checkoutFulfillmentTitle')}</Text>
        <View style={styles.pillRow}>
          <Pressable
            style={[styles.pill, fulfillment === 'pickup' && styles.pillActive]}
            onPress={() => {
              setFulfillment('pickup');
              setPaymentMethod('pay_at_branch');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: fulfillment === 'pickup' }}
            accessibilityLabel={fulfillmentTypeLabel(t, 'pickup')}
          >
            <Text style={[styles.pillText, fulfillment === 'pickup' && styles.pillTextActive]}>
              {fulfillmentTypeLabel(t, 'pickup')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, fulfillment === 'delivery' && styles.pillActive]}
            onPress={() => {
              setFulfillment('delivery');
              setPaymentMethod('payme');
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: fulfillment === 'delivery' }}
            accessibilityLabel={fulfillmentTypeLabel(t, 'delivery')}
          >
            <Text style={[styles.pillText, fulfillment === 'delivery' && styles.pillTextActive]}>
              {fulfillmentTypeLabel(t, 'delivery')}
            </Text>
          </Pressable>
        </View>

        {fulfillment === 'pickup' ? (
          <View style={styles.infoCard} accessibilityRole="text">
            <Feather name="shopping-bag" size={16} color={PURPLE} />
            <View style={styles.infoBody}>
              <Text style={styles.infoTitle}>{fulfillmentTypeLabel(t, 'pickup')}</Text>
              <Text style={styles.infoText}>
                {t('cart.checkoutPickupInfo')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.deliveryBlock}>
            <View style={styles.infoCard} accessibilityRole="text">
              <Feather name="truck" size={16} color={PURPLE} />
              <View style={styles.infoBody}>
                <Text style={styles.infoTitle}>{fulfillmentTypeLabel(t, 'delivery')}</Text>
                <Text style={styles.infoText}>
                  {t('cart.checkoutDeliveryInfo')}
                </Text>
                <Text style={styles.infoTiming}>{t('cart.checkoutDeliveryTiming')}</Text>
                {deliveryFeeKnown ? (
                  <Text
                    style={styles.infoFee}
                    accessibilityLabel={t('cart.checkoutDeliveryFeeA11y', { amount: fmt.money(deliveryFee) })}
                  >
                    {t('cart.checkoutDeliveryFee', { amount: fmt.money(deliveryFee) })}
                  </Text>
                ) : (
                  <Text style={styles.infoFeeWarn}>{t('cart.checkoutDeliveryFeePending')}</Text>
                )}
              </View>
            </View>

            <Text style={styles.fieldLabel}>{t('cart.checkoutAddressLabel')}</Text>

            {/* Map Address Picker CTA & Resolved Card */}
            {mapAddressResolved ? (
              <View style={styles.resolvedAddressCard}>
                <View style={styles.resolvedAddressHeader}>
                  <View style={styles.resolvedIconWrap}>
                    <Feather name="map-pin" size={18} color={PURPLE} />
                  </View>
                  <View style={styles.resolvedTextWrap}>
                    <Text style={styles.resolvedLabel}>{t('cart.checkoutSelectedAddress')}</Text>
                    <Text style={styles.resolvedAddressText} numberOfLines={2}>
                      {mapAddressResolved}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={styles.changeAddressBtn}
                  onPress={() => setShowMapPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('cart.checkoutChangeAddress')}
                >
                  <Feather name="edit-2" size={14} color={PURPLE} />
                  <Text style={styles.changeAddressBtnText}>{t('cart.checkoutChangeAddress')}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.pickMapBtn}
                onPress={() => setShowMapPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('cart.checkoutPickOnMap')}
              >
                <Feather name="map" size={18} color={PURPLE} />
                <Text style={styles.pickMapBtnText}>{t('cart.checkoutPickOnMap')}</Text>
              </Pressable>
            )}

            {!mapAddressResolved ? (
              <>
                <TextInput
                  value={addrDistrict}
                  onChangeText={setAddrDistrict}
                  placeholder={t('cart.checkoutAddrDistrict')}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={t('cart.checkoutAddrDistrict')}
                  autoCorrect={false}
                />

                <TextInput
                  value={addrStreet}
                  onChangeText={setAddrStreet}
                  placeholder={t('cart.checkoutAddrStreet')}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={t('cart.checkoutAddrStreet')}
                  autoCorrect={false}
                />
              </>
            ) : null}

            <View style={styles.multiFieldRow}>
              <View style={styles.multiFieldThird}>
                <TextInput
                  value={addrHouse}
                  onChangeText={setAddrHouse}
                  placeholder={`${t('cart.checkoutAddrHouse')} *`}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={`${t('cart.checkoutAddrHouse')} *`}
                  autoCorrect={false}
                />
              </View>
              <View style={styles.multiFieldThird}>
                <TextInput
                  value={addrApartment}
                  onChangeText={setAddrApartment}
                  placeholder={t('cart.checkoutAddrApartment')}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={t('cart.checkoutAddrApartment')}
                  autoCorrect={false}
                />
              </View>
              <View style={styles.multiFieldThird}>
                <TextInput
                  value={addrEntrance}
                  onChangeText={setAddrEntrance}
                  placeholder={t('cart.checkoutAddrEntrance')}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={t('cart.checkoutAddrEntrance')}
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.multiFieldRow}>
              <View style={styles.multiFieldHalf}>
                <TextInput
                  value={addrFloor}
                  onChangeText={setAddrFloor}
                  placeholder={t('cart.checkoutAddrFloor')}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={t('cart.checkoutAddrFloor')}
                  autoCorrect={false}
                />
              </View>
              <View style={styles.multiFieldHalf}>
                <TextInput
                  value={addrLandmark}
                  onChangeText={setAddrLandmark}
                  placeholder={t('cart.checkoutAddrLandmark')}
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  accessibilityLabel={t('cart.checkoutAddrLandmark')}
                  autoCorrect={false}
                />
              </View>
            </View>

            <TextInput
              value={addrComment}
              onChangeText={setAddrComment}
              placeholder={t('cart.checkoutAddrComment')}
              placeholderTextColor={MUTED}
              style={styles.input}
              accessibilityLabel={t('cart.checkoutAddrComment')}
              autoCorrect={false}
            />

            {!hasValidDeliveryAddress && (addrDistrict.length > 0 || addrStreet.length > 0 || addrHouse.length > 0) ? (
              <Text style={styles.inlineHintWarn}>
                {t('cart.checkoutAddressTooShort', { min: MIN_ADDRESS_LENGTH })}
              </Text>
            ) : null}
          </View>
        )}

        {/* Cashback */}
        {showCashback ? (
          <>
            <Text style={styles.sectionTitle}>{t('common.navCashback')}</Text>
            <View style={styles.cashbackCard}>
              <Pressable
                onPress={() => setUseCashback(!useCashback)}
                style={styles.cashbackRow}
                accessibilityRole="switch"
                accessibilityState={{ checked: useCashback }}
                accessibilityLabel={t('cart.checkoutUseCashback')}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cashbackTitle}>{t('cart.checkoutUseCashback')}</Text>
                  <Text style={styles.cashbackMeta} numberOfLines={1}>
                    {t('cart.checkoutCashbackAvailable', { amount: fmt.money(balanceNum) })}
                  </Text>
                  {useCashback && cashbackUsed > 0 ? (
                    <Text style={styles.cashbackPreview} numberOfLines={1}>
                      {t('cart.checkoutCashbackPreview', { amount: fmt.money(cashbackUsed) })}
                    </Text>
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
              <Text style={styles.cashbackHint}>
                {maxSpendPercent != null
                  ? t('cart.checkoutCashbackHintCap', { percent: maxSpendPercent })
                  : t('cart.checkoutCashbackHint')}
              </Text>
            </View>
          </>
        ) : null}

        {/* Payment */}
        <Text style={styles.sectionTitle}>{t('cart.checkoutPaymentTitle')}</Text>
        {paymentOptions.map((opt) => {
          const selected = paymentMethod === opt.value && opt.enabled;
          if (!opt.enabled) {
            return (
              <View
                key={opt.value}
                style={[styles.optionRow, styles.optionDisabled]}
                accessibilityRole="text"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={`${opt.label}. ${opt.hint || t('cart.checkoutUnavailable')}`}
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
          <Text style={styles.summaryTitle}>{t('cart.summaryTitle')}</Text>
          <SummaryRow label={t('cart.summaryItems')} value={fmt.money(goods)} />
          {fulfillment === 'delivery' ? (
            deliveryFeeKnown ? (
              <SummaryRow label={fulfillmentTypeLabel(t, 'delivery')} value={fmt.money(deliveryFee)} />
            ) : (
              <SummaryRow label={fulfillmentTypeLabel(t, 'delivery')} value={t('common.unknown')} warn />
            )
          ) : null}
          {useCashback && cashbackUsed > 0 ? (
            <SummaryRow label={t('common.navCashback')} value={`− ${fmt.money(cashbackUsed)}`} warn />
          ) : null}
          <View style={styles.summaryDivider} />
          <SummaryRow label={t('cart.checkoutTotalEstimate')} value={fmt.money(totalPreview)} bold />
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
              <Text style={styles.footerSumLabel}>{t('cart.checkoutTotalEstimate')}</Text>
              <Text style={styles.footerSumValue} numberOfLines={1}>
                {fmt.money(totalPreview)}
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
              accessibilityLabel={t('cart.checkoutSubmit')}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText} numberOfLines={1}>
                  {t('cart.checkoutSubmit')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Delivery Map Picker Modal */}
      <DeliveryMapPickerModal
        visible={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onConfirm={handleMapConfirm}
        initialCoords={addrCoords}
        initialAddress={mapAddressResolved}
      />
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
  root: {
    flex: 1,
    backgroundColor: BG,
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scroll: { flex: 1, width: '100%', maxWidth: '100%' },
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
  inlineHintWarn: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: WARN,
    marginBottom: 8,
    marginTop: -4,
  },
  deliveryBlock: {
    marginBottom: 4,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  infoBody: { flex: 1, minWidth: 0 },
  infoTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  infoText: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  infoTiming: {
    marginTop: 8,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  infoFee: {
    marginTop: 6,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE,
  },
  infoFeeWarn: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: WARN,
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
  multiFieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  multiFieldThird: {
    flex: 1,
  },
  multiFieldHalf: {
    flex: 1,
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
  pickMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8F5FF',
    borderWidth: 1.5,
    borderColor: '#5C328E',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  pickMapBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#5C328E',
  },
  resolvedAddressCard: {
    backgroundColor: '#F8F5FF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  resolvedAddressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  resolvedIconWrap: {
    marginTop: 2,
  },
  resolvedTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  resolvedLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  resolvedAddressText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
    lineHeight: 18,
  },
  changeAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  changeAddressBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#5C328E',
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
  ctaDisabled: {
    opacity: 0.5,
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
