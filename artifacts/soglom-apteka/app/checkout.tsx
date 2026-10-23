import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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
import { api, API_URL, newIdempotencyKey, type ApiError, type CustomerSavedAddress } from '@/lib/api';
import DeliveryMapPickerModal from '@/components/DeliveryMapPickerModal';
import type { DeliveryAddressSelection } from '@/lib/maps';
import { confirmAction, notify } from '@/lib/dialogs';
import type { TranslationKey } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';
import { fulfillmentTypeLabel, paymentMethodLabel } from '@/lib/orderLabels';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F4F2F8';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const WARN = '#B45309';
const BAD = '#B91C1C';
const OK = '#16A34A';
const PAYME_COLOR = '#00BFA5';
const CLICK_COLOR = '#0073FF';

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

  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('pay_at_branch');
  const [useCashback, setUseCashback] = useState(false);
  const [cart, setCart] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [savedAddresses, setSavedAddresses] = useState<CustomerSavedAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<CustomerSavedAddress | null>(null);
  const [deliveryMapModalVisible, setDeliveryMapModalVisible] = useState(false);
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
  const selectedAddressRef = useRef<CustomerSavedAddress | null>(null);
  selectedAddressRef.current = selectedAddress;

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
        const [, c, r, addrRes] = await Promise.all([
          refresh(),
          api.cart(),
          api.cashbackRules().catch(() => null),
          api.getAddresses().catch(() => null),
        ]);
        if (gen !== loadGen.current) return;
        applyCart(c);
        setRules(r);
        if (Array.isArray(addrRes?.addresses)) {
          setSavedAddresses(addrRes?.addresses);
          if (!selectedAddressRef.current && addrRes.addresses.length > 0) {
            setSelectedAddress(addrRes.addresses[0]);
          }
        }
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

  const openCart = () => {
    router.replace('/cart');
  };

  const DELIVERY_FEE = 15000;
  const deliveryFee = fulfillment === 'delivery' ? DELIVERY_FEE : 0;

  const handleSelectFulfillment = (type: 'pickup' | 'delivery') => {
    setFulfillment(type);
    if (type === 'delivery' && paymentMethod === 'pay_at_branch') {
      setPaymentMethod('payme');
    }
  };

  const handleMapConfirm = async (sel: DeliveryAddressSelection) => {
    setDeliveryMapModalVisible(false);
    try {
      const res = await api.createAddress({
        label: 'home',
        formattedAddress: sel.formattedAddress,
        latitude: sel.latitude,
        longitude: sel.longitude,
        district: sel.district,
        street: sel.street,
        house: sel.house,
        apartment: sel.apartment,
        entrance: sel.entrance,
        floor: sel.floor,
        landmark: sel.landmark,
        courierNote: sel.courierNote,
        isDefault: savedAddresses.length === 0,
      });
      if (res?.address) {
        setSelectedAddress(res.address);
        setSavedAddresses((prev) => [res.address, ...prev]);
      } else {
        await loadCheckout({ force: true });
      }
    } catch (err) {
      notify(t('common.errorTitle'), localizeError(err, t));
    }
  };

  const getAddressLabelText = (addr: CustomerSavedAddress) => {
    if (addr.title && addr.title.trim().length > 0) return addr.title;
    if (addr.label === 'work') return t('profile.addressLabelWork');
    if (addr.label === 'other') return t('profile.addressLabelOther');
    return t('profile.addressLabelHome');
  };

  const getAddressIcon = (label: string) => {
    if (label === 'work') return 'briefcase';
    if (label === 'other') return 'map-pin';
    return 'home';
  };

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const hasItems = items.length > 0;
  const selectedBranch = cart?.branch || null;

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

  const showCashback = balanceNum > 0 && goods > 0;
  const cashbackPreview =
    useCashback && showCashback && spendCap > 0
      ? Math.min(balanceNum, Math.floor(goods * spendCap))
      : null;
  const cashbackUsed = cashbackPreview != null && cashbackPreview > 0 ? cashbackPreview : 0;
  const totalPreview = Math.max(0, goods + deliveryFee - cashbackUsed);

  const stockIssues = items.filter((item: any) => Boolean(item.stockInsufficient));

  const paymentOptions: Array<{
    value: string;
    label: string;
    desc: string;
    icon: string;
    iconColor: string;
    iconBg: string;
    available: boolean;
  }> = [
    {
      value: 'pay_at_branch',
      label: paymentMethodLabel(t, 'pay_at_branch'),
      desc: t('cart.checkoutPayAtBranchDesc'),
      icon: 'storefront-outline',
      iconColor: PURPLE,
      iconBg: '#F3EEFF',
      available: fulfillment === 'pickup',
    },
    {
      value: 'payme',
      label: paymentMethodLabel(t, 'payme'),
      desc: t('cart.checkoutPaymeDesc'),
      icon: 'credit-card-outline',
      iconColor: PAYME_COLOR,
      iconBg: '#E0F7F6',
      available: true,
    },
    {
      value: 'click',
      label: paymentMethodLabel(t, 'click'),
      desc: t('cart.checkoutClickDesc'),
      icon: 'cellphone-check',
      iconColor: CLICK_COLOR,
      iconBg: '#EBF3FF',
      available: true,
    },
  ].filter((opt) => opt.available);

  const canSubmit =
    hasItems &&
    branchId != null &&
    !submitting &&
    (fulfillment === 'pickup' || selectedAddress != null);

  const explainBlocked = () => {
    if (!hasItems) {
      notify(t('common.navCart'), t('cart.cartEmptyTitle'));
      return;
    }
    if (!branchId) {
      notify(t('cart.branchLabel'), t('cart.checkoutBranchRequired'));
      return;
    }
    if (fulfillment === 'delivery' && !selectedAddress) {
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
    if (fulfillment === 'delivery' && !selectedAddress) {
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
      const deliveryAddressText =
        fulfillment === 'delivery' && selectedAddress
          ? [
              selectedAddress.formattedAddress,
              selectedAddress.house ? `${t('profile.addressHouse')} ${selectedAddress.house}` : null,
              selectedAddress.apartment ? `${t('profile.addressApartment')} ${selectedAddress.apartment}` : null,
              selectedAddress.entrance ? `${t('profile.addressEntrance')} ${selectedAddress.entrance}` : null,
              selectedAddress.floor ? `${t('profile.addressFloor')} ${selectedAddress.floor}` : null,
              selectedAddress.courierNote || null,
            ]
              .filter(Boolean)
              .join(', ')
          : '';

      const result = await api.checkout(
        {
          branchId,
          fulfillment,
          paymentMethod,
          address: deliveryAddressText,
          useCashback: Boolean(useCashback && showCashback),
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
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 14);
  const sidePad = narrow ? 14 : 18;
  const footerFallback = 14 + 56 + 12 + bottomPad;
  const scrollClearance = (footerHeight > 0 ? footerHeight : footerFallback) + 32;
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
          <SkeletonBlock style={{ height: 110, borderRadius: 18, width: '100%', marginBottom: 14 }} />
          <SkeletonBlock style={{ height: 160, borderRadius: 18, width: '100%', marginBottom: 14 }} />
          <SkeletonBlock style={{ height: 140, borderRadius: 18, width: '100%', marginBottom: 14 }} />
          <SkeletonBlock style={{ height: 120, borderRadius: 18, width: '100%' }} />
        </ScrollView>
      </View>
    );
  }

  if (loadError && !cart) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <MaterialCommunityIcons name="cloud-off-outline" size={48} color={MUTED} />
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
            <Feather name="shopping-cart" size={32} color={PURPLE} />
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
            paddingBottom: hasItems ? 12 : 24 + bottomPad,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* SECTION 1: Fulfillment & Branch / Delivery Address */}
        <View style={styles.sectionWrap}>
          {/* Fulfillment Toggle Tabs */}
          <View style={styles.fulfillmentTabs}>
            <Pressable
              style={[
                styles.fulfillmentTab,
                fulfillment === 'pickup' && styles.fulfillmentTabActive,
              ]}
              onPress={() => handleSelectFulfillment('pickup')}
              accessibilityRole="tab"
              accessibilityState={{ selected: fulfillment === 'pickup' }}
              accessibilityLabel={fulfillmentTypeLabel(t, 'pickup')}
            >
              <Feather
                name="shopping-bag"
                size={16}
                color={fulfillment === 'pickup' ? '#FFFFFF' : PURPLE}
              />
              <Text
                style={[
                  styles.fulfillmentTabText,
                  fulfillment === 'pickup' && styles.fulfillmentTabTextActive,
                ]}
              >
                {fulfillmentTypeLabel(t, 'pickup')}
              </Text>
              <View
                style={[
                  styles.tabFeeBadge,
                  fulfillment === 'pickup' ? styles.tabFeeBadgeActive : styles.tabFeeBadgeInactive,
                ]}
              >
                <Text
                  style={[
                    styles.tabFeeBadgeText,
                    fulfillment === 'pickup' && styles.tabFeeBadgeTextActive,
                  ]}
                >
                  {t('cart.checkoutPickupFree')}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.fulfillmentTab,
                fulfillment === 'delivery' && styles.fulfillmentTabActive,
              ]}
              onPress={() => handleSelectFulfillment('delivery')}
              accessibilityRole="tab"
              accessibilityState={{ selected: fulfillment === 'delivery' }}
              accessibilityLabel={fulfillmentTypeLabel(t, 'delivery')}
            >
              <Feather
                name="truck"
                size={16}
                color={fulfillment === 'delivery' ? '#FFFFFF' : PURPLE}
              />
              <Text
                style={[
                  styles.fulfillmentTabText,
                  fulfillment === 'delivery' && styles.fulfillmentTabTextActive,
                ]}
              >
                {fulfillmentTypeLabel(t, 'delivery')}
              </Text>
              <View
                style={[
                  styles.tabFeeBadge,
                  fulfillment === 'delivery' ? styles.tabFeeBadgeActive : styles.tabFeeBadgeInactive,
                ]}
              >
                <Text
                  style={[
                    styles.tabFeeBadgeText,
                    fulfillment === 'delivery' && styles.tabFeeBadgeTextActive,
                  ]}
                >
                  {fmt.money(DELIVERY_FEE)}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Fulfillment Content Card */}
          {fulfillment === 'pickup' ? (
            <View style={styles.fulfillmentCard}>
              <View style={styles.fulfillmentHeader}>
                <View style={styles.fulfillmentIconWrap}>
                  <Feather name="shopping-bag" size={18} color={PURPLE} />
                </View>
                <View style={styles.fulfillmentHeaderTextWrap}>
                  <Text style={styles.fulfillmentTitle}>{fulfillmentTypeLabel(t, 'pickup')}</Text>
                  <Text style={styles.fulfillmentSub}>{t('cart.checkoutPickupReady')}</Text>
                </View>
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>{t('cart.checkoutPickupFree')}</Text>
                </View>
              </View>

              <View style={styles.branchBoxDivider} />

              {selectedBranch?.name ? (
                <View style={styles.branchDetails}>
                  <View style={styles.branchHeaderRow}>
                    <View style={styles.branchPinWrap}>
                      <Feather name="map-pin" size={15} color={PURPLE} />
                    </View>
                    <View style={styles.branchTitleWrap}>
                      <Text style={styles.branchName} numberOfLines={2}>
                        {String(selectedBranch.name)}
                      </Text>
                      {selectedBranch.address ? (
                        <Text style={styles.branchAddress} numberOfLines={2}>
                          {String(selectedBranch.address)}
                        </Text>
                      ) : null}
                      {selectedBranch.hours ? (
                        <View style={styles.branchHoursRow}>
                          <Feather name="clock" size={12} color={MUTED} />
                          <Text style={styles.branchHoursText} numberOfLines={1}>
                            {String(selectedBranch.hours)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <Pressable
                    style={styles.changeBranchBtn}
                    onPress={openBranches}
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.changeBranchA11y')}
                  >
                    <Feather name="map" size={14} color={PURPLE} />
                    <Text style={styles.changeBranchBtnText}>{t('cart.change')}</Text>
                    <Feather name="chevron-right" size={14} color={PURPLE} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.branchEmptyBox}>
                  <Text style={styles.warnText}>{t('cart.branchNotSelected')}</Text>
                  <Pressable
                    style={styles.selectBranchCta}
                    onPress={openBranches}
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.chooseBranch')}
                  >
                    <Feather name="plus-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.selectBranchCtaText}>{t('cart.chooseBranch')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.fulfillmentCard}>
              <View style={styles.fulfillmentHeader}>
                <View style={styles.fulfillmentIconWrap}>
                  <Feather name="truck" size={18} color={PURPLE} />
                </View>
                <View style={styles.fulfillmentHeaderTextWrap}>
                  <Text style={styles.fulfillmentTitle}>{t('cart.checkoutAddressLabel')}</Text>
                  <Text style={styles.fulfillmentSub}>{t('cart.checkoutDeliveryInfo')}</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/addresses')}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.addressesTitle')}
                  style={styles.manageAddressLink}
                >
                  <Text style={styles.manageAddressLinkText}>{t('profile.addressesTitle')}</Text>
                  <Feather name="chevron-right" size={13} color={PURPLE} />
                </Pressable>
              </View>

              {/* Saved Addresses Chip Row */}
              {savedAddresses.length > 0 ? (
                <View style={styles.savedAddressesWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.addressChipsScroll}
                  >
                    {savedAddresses.map((addr) => {
                      const isSel = selectedAddress?.id === addr.id;
                      return (
                        <Pressable
                          key={addr.id}
                          style={[styles.addrChip, isSel && styles.addrChipActive]}
                          onPress={() => setSelectedAddress(addr)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSel }}
                          accessibilityLabel={getAddressLabelText(addr)}
                        >
                          <Feather
                            name={getAddressIcon(addr.label) as any}
                            size={13}
                            color={isSel ? '#FFFFFF' : PURPLE}
                          />
                          <Text style={[styles.addrChipText, isSel && styles.addrChipTextActive]}>
                            {getAddressLabelText(addr)}
                          </Text>
                          {addr.isDefault ? (
                            <View style={[styles.defDot, isSel && styles.defDotActive]} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      style={styles.addrChipAdd}
                      onPress={() => setDeliveryMapModalVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.addAddress')}
                    >
                      <Feather name="plus" size={14} color={PURPLE} />
                      <Text style={styles.addrChipAddText}>{t('profile.addAddress')}</Text>
                    </Pressable>
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.branchBoxDivider} />

              {/* Selected Address Details Box */}
              {selectedAddress ? (
                <View style={styles.branchDetails}>
                  <View style={styles.branchHeaderRow}>
                    <View style={styles.branchPinWrap}>
                      <Feather
                        name={getAddressIcon(selectedAddress.label) as any}
                        size={15}
                        color={PURPLE}
                      />
                    </View>
                    <View style={styles.branchTitleWrap}>
                      <View style={styles.selectedAddrHeaderRow}>
                        <Text style={styles.branchName} numberOfLines={1}>
                          {getAddressLabelText(selectedAddress)}
                        </Text>
                        {selectedAddress.isDefault ? (
                          <View style={styles.selectedAddrDefBadge}>
                            <Text style={styles.selectedAddrDefBadgeText}>
                              {t('profile.addressDefaultBadge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.branchAddress} numberOfLines={3}>
                        {selectedAddress.formattedAddress}
                      </Text>
                      {selectedAddress.house ||
                      selectedAddress.apartment ||
                      selectedAddress.entrance ||
                      selectedAddress.floor ? (
                        <View style={styles.addrDetailsMetaRow}>
                          {selectedAddress.house ? (
                            <Text style={styles.addrMetaPill}>
                              {`${t('profile.addressHouse')} ${selectedAddress.house}`}
                            </Text>
                          ) : null}
                          {selectedAddress.apartment ? (
                            <Text style={styles.addrMetaPill}>
                              {`${t('profile.addressApartment')} ${selectedAddress.apartment}`}
                            </Text>
                          ) : null}
                          {selectedAddress.entrance ? (
                            <Text style={styles.addrMetaPill}>
                              {`${t('profile.addressEntrance')} ${selectedAddress.entrance}`}
                            </Text>
                          ) : null}
                          {selectedAddress.floor ? (
                            <Text style={styles.addrMetaPill}>
                              {`${t('profile.addressFloor')} ${selectedAddress.floor}`}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {selectedAddress.courierNote ? (
                        <View style={styles.courierNoteRow}>
                          <Feather name="message-square" size={12} color={MUTED} />
                          <Text style={styles.courierNoteText} numberOfLines={2}>
                            {selectedAddress.courierNote}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <Pressable
                    style={styles.changeBranchBtn}
                    onPress={() => setDeliveryMapModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.checkoutChangeAddress')}
                  >
                    <Feather name="map-pin" size={14} color={PURPLE} />
                    <Text style={styles.changeBranchBtnText}>{t('cart.checkoutChangeAddress')}</Text>
                    <Feather name="chevron-right" size={14} color={PURPLE} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.branchEmptyBox}>
                  <Text style={styles.warnText}>{t('cart.checkoutAddressRequired')}</Text>
                  <Pressable
                    style={styles.selectBranchCta}
                    onPress={() => setDeliveryMapModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.addAddress')}
                  >
                    <Feather name="plus-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.selectBranchCtaText}>{t('profile.addAddress')}</Text>
                  </Pressable>
                </View>
              )}

              {/* Nearest branch dispatch reassurance */}
              {selectedBranch?.name ? (
                <View style={styles.dispatchNoteRow}>
                  <Feather name="package" size={13} color={MUTED} />
                  <Text style={styles.dispatchNoteText} numberOfLines={1}>
                    {selectedBranch.name}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Stock Alert (if any issues) */}
        {stockIssues.length ? (
          <View style={styles.warnCard}>
            <View style={styles.warnCardHeader}>
              <Feather name="alert-triangle" size={16} color={WARN} />
              <Text style={styles.warnTitle}>{t('cart.stockShortMessage')}</Text>
            </View>
            {stockIssues.map((item: any) => {
              const name = (localizedName(language, item.product) || t('cart.productFallbackName'));
              const avail =
                item.available != null && Number.isFinite(Number(item.available))
                  ? Number(item.available)
                  : null;
              return (
                <Text key={item.id} style={styles.warnLine} numberOfLines={2}>
                  • {name}
                  {avail != null ? ` (${t('cart.checkoutStockAvailableShort', { count: avail })})` : ''}
                </Text>
              );
            })}
            <Text style={styles.warnNote}>{t('cart.checkoutStockNote')}</Text>
          </View>
        ) : null}

        {/* SECTION 2: Order Items (Buyurtma tarkibi) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>{t('cart.checkoutOrderItems')}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{items.length}</Text>
              </View>
            </View>
            <Pressable
              style={styles.editCartLink}
              onPress={openCart}
              accessibilityRole="button"
              accessibilityLabel={t('cart.checkoutEditCart')}
            >
              <Feather name="edit-2" size={13} color={PURPLE} />
              <Text style={styles.editCartLinkText}>{t('cart.checkoutEditCart')}</Text>
            </Pressable>
          </View>

          <View style={styles.itemsCard}>
            {items.map((item: any, idx: number) => {
              const product = item.product || {};
              const rawName = localizedName(language, product) || t('cart.productFallbackName');
              const name = cleanText(rawName);
              const qty = Math.max(1, Number(item.quantity) || 1);
              const unitPrice = Number(item.unitPrice ?? product.price ?? 0);
              const lineTotal = Number(item.lineTotal ?? unitPrice * qty);
              const itemImg = getProductImage(product);
              const isLast = idx === items.length - 1;

              return (
                <View key={item.id}>
                  <View style={styles.lineItem}>
                    <View style={styles.lineIconWrap}>
                      {itemImg ? (
                        <Image source={itemImg} style={styles.lineImg} resizeMode="contain" />
                      ) : (
                        <MaterialCommunityIcons
                          name={productIconName(product.icon)}
                          size={24}
                          color={PURPLE}
                        />
                      )}
                    </View>
                    <View style={styles.lineBody}>
                      <Text style={styles.lineName} numberOfLines={2}>
                        {name}
                      </Text>
                      <View style={styles.lineBottomRow}>
                        <View style={styles.qtyPill}>
                          <Text style={styles.qtyPillText}>
                            {t('cart.checkoutLineMeta', { qty, price: fmt.money(unitPrice) })}
                          </Text>
                        </View>
                        <Text style={styles.lineTotalText} numberOfLines={1}>
                          {fmt.money(lineTotal)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {!isLast ? <View style={styles.itemDivider} /> : null}
                </View>
              );
            })}
          </View>
        </View>

        {/* SECTION 3: Payment Method (To'lov usuli) */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>{t('cart.checkoutPaymentTitle')}</Text>
          <View style={styles.paymentCardsWrap}>
            {paymentOptions.map((opt) => {
              const selected = paymentMethod === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPaymentMethod(opt.value)}
                  style={[styles.paymentCard, selected && styles.paymentCardSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${opt.label}. ${opt.desc}`}
                >
                  <View style={[styles.paymentIconBox, { backgroundColor: opt.iconBg }]}>
                    <MaterialCommunityIcons
                      name={opt.icon as any}
                      size={22}
                      color={opt.iconColor}
                    />
                  </View>
                  <View style={styles.paymentInfoBox}>
                    <Text style={styles.paymentCardTitle} numberOfLines={1}>
                      {opt.label}
                    </Text>
                    <Text style={styles.paymentCardDesc} numberOfLines={2}>
                      {opt.desc}
                    </Text>
                  </View>
                  <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* SECTION 4: Cashback (Keshbek) */}
        {showCashback ? (
          <View style={styles.sectionWrap}>
            <View style={styles.cashbackCard}>
              <Pressable
                onPress={() => setUseCashback(!useCashback)}
                style={styles.cashbackRow}
                accessibilityRole="switch"
                accessibilityState={{ checked: useCashback }}
                accessibilityLabel={t('cart.checkoutUseCashback')}
              >
                <View style={styles.cashbackCoinWrap}>
                  <MaterialCommunityIcons name="star-circle" size={24} color="#D97706" />
                </View>
                <View style={styles.cashbackContent}>
                  <Text style={styles.cashbackTitle}>{t('cart.checkoutUseCashback')}</Text>
                  <Text style={styles.cashbackBalance} numberOfLines={1}>
                    {t('cart.checkoutCashbackAvailable', { amount: fmt.money(balanceNum) })}
                  </Text>
                  {useCashback && cashbackUsed > 0 ? (
                    <Text style={styles.cashbackDiscount} numberOfLines={1}>
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
          </View>
        ) : null}

        {/* SECTION 5: Reassurance / QR-code guarantee banner */}
        <View style={styles.reassuranceBanner}>
          <Feather name="shield" size={18} color={PURPLE} />
          <Text style={styles.reassuranceText}>
            {fulfillment === 'delivery'
              ? t('cart.checkoutDeliveryTiming')
              : t('cart.checkoutPickupGuarantee')}
          </Text>
        </View>

        {/* SECTION 6: Order Summary (Hisob-kitob) */}
        <View style={styles.sectionWrap}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t('cart.summaryTitle')}</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('cart.summaryItems')}</Text>
              <Text style={styles.summaryValue}>{fmt.money(goods)}</Text>
            </View>

            {fulfillment === 'delivery' ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{fulfillmentTypeLabel(t, 'delivery')}</Text>
                <Text style={styles.summaryValue}>{fmt.money(DELIVERY_FEE)}</Text>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{fulfillmentTypeLabel(t, 'pickup')}</Text>
                <Text style={styles.summaryValueFree}>{t('cart.checkoutPickupFree')}</Text>
              </View>
            )}

            {useCashback && cashbackUsed > 0 ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('common.navCashback')}</Text>
                <Text style={styles.summaryValueDiscount}>{`− ${fmt.money(cashbackUsed)}`}</Text>
              </View>
            ) : null}

            <View style={styles.summaryDivider} />

            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>{t('cart.checkoutTotalToPay')}</Text>
              <Text style={styles.summaryTotalValue}>{fmt.money(totalPreview)}</Text>
            </View>
          </View>
        </View>

        {/* Bottom clearance spacer */}
        {hasItems ? (
          <View
            style={{ height: scrollClearance }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Bar */}
      {hasItems ? (
        <View
          style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}
          onLayout={(e) => {
            const h = Math.ceil(e.nativeEvent.layout.height);
            if (h > 0 && Math.abs(h - footerHeight) > 1) setFooterHeight(h);
          }}
        >
          <View style={[styles.footerInner, { maxWidth: contentWidth - sidePad * 2, width: '100%' }]}>
            <View style={styles.footerPriceCol}>
              <Text style={styles.footerPriceLabel}>{t('cart.checkoutTotalToPay')}</Text>
              <Text style={styles.footerPriceValue} numberOfLines={1}>
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
                <View style={styles.ctaContent}>
                  <Text style={styles.ctaText} numberOfLines={1}>
                    {t('cart.checkoutSubmit')}
                  </Text>
                  <Feather name="arrow-right" size={17} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <DeliveryMapPickerModal
        visible={deliveryMapModalVisible}
        onClose={() => setDeliveryMapModalVisible(false)}
        onConfirm={handleMapConfirm}
      />
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
    paddingTop: 14,
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: PURPLE_DEEP,
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

  sectionWrap: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  countBadge: {
    backgroundColor: LAVENDER,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: PURPLE,
  },
  editCartLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  editCartLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },

  /* Fulfillment Tabs */
  fulfillmentTabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  fulfillmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  fulfillmentTabActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(106, 34, 214, 0.2)' } as any,
    }),
  },
  fulfillmentTabText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13.5,
    color: PURPLE_DEEP,
  },
  fulfillmentTabTextActive: {
    color: '#FFFFFF',
  },
  tabFeeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tabFeeBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabFeeBadgeInactive: {
    backgroundColor: LAVENDER,
  },
  tabFeeBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: PURPLE,
  },
  tabFeeBadgeTextActive: {
    color: '#FFFFFF',
  },

  manageAddressLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  manageAddressLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },

  savedAddressesWrap: {
    marginTop: 12,
  },
  addressChipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  addrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    borderWidth: 1,
    borderColor: '#E2D9F5',
  },
  addrChipActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  addrChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },
  addrChipTextActive: {
    color: '#FFFFFF',
  },
  defDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PURPLE,
  },
  defDotActive: {
    backgroundColor: '#FFFFFF',
  },
  addrChipAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: PURPLE,
    backgroundColor: '#FAF7FF',
  },
  addrChipAddText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },

  selectedAddrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedAddrDefBadge: {
    backgroundColor: '#E8F8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  selectedAddrDefBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    color: OK,
  },
  addrDetailsMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  addrMetaPill: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: PURPLE_DEEP,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  courierNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  courierNoteText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: MUTED,
    fontStyle: 'italic',
  },
  dispatchNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0EEF5',
  },
  dispatchNoteText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: MUTED,
  },

  /* Fulfillment & Branch Card */
  fulfillmentCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(26, 16, 64, 0.04)' } as any,
      default: {
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  fulfillmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fulfillmentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fulfillmentHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  fulfillmentTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  fulfillmentSub: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  freeBadge: {
    backgroundColor: '#E8F8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  freeBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: OK,
  },
  branchBoxDivider: {
    height: 1,
    backgroundColor: '#F0EEF5',
    marginVertical: 14,
  },
  branchDetails: {
    backgroundColor: '#FAF9FD',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECE7F6',
  },
  branchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  branchPinWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  branchTitleWrap: {
    flex: 1,
    minWidth: 0,
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
    lineHeight: 16,
  },
  branchHoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  branchHoursText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  changeBranchBtn: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EBE6F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  changeBranchBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  branchEmptyBox: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  warnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: WARN,
    marginBottom: 8,
  },
  selectBranchCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  selectBranchCtaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },

  /* Stock Warning Alert */
  warnCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warnCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  warnTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: WARN,
  },
  warnLine: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: BAD,
    marginTop: 2,
    marginLeft: 4,
  },
  warnNote: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },

  /* Order Items List */
  itemsCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(26, 16, 64, 0.04)' } as any,
      default: {
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  lineIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FAF9FD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ECE7F6',
    overflow: 'hidden',
  },
  lineImg: {
    width: '84%',
    height: '84%',
  },
  lineBody: {
    flex: 1,
    minWidth: 0,
  },
  lineName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  lineBottomRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  qtyPill: {
    backgroundColor: '#F3F1F7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qtyPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  lineTotalText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13.5,
    color: PURPLE,
    textAlign: 'right',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F3F1F7',
  },

  /* Payment Methods */
  paymentCardsWrap: {
    marginTop: 8,
    gap: 10,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  paymentCardSelected: {
    borderColor: PURPLE,
    backgroundColor: '#FAF7FF',
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(106, 34, 214, 0.08)' } as any,
    }),
  },
  paymentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfoBox: {
    flex: 1,
    minWidth: 0,
  },
  paymentCardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  paymentCardDesc: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D4CDE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: PURPLE,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PURPLE,
  },

  /* Cashback Card */
  cashbackCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E8E1F8',
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(26, 16, 64, 0.04)' } as any,
    }),
  },
  cashbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashbackCoinWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashbackContent: {
    flex: 1,
    minWidth: 0,
  },
  cashbackTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14.5,
    color: PURPLE_DEEP,
  },
  cashbackBalance: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
  },
  cashbackDiscount: {
    marginTop: 4,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: OK,
  },
  cashbackHint: {
    marginTop: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    color: MUTED,
  },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5E1EE',
    padding: 2.5,
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleTrackOn: {
    backgroundColor: PURPLE,
  },
  toggleThumb: {
    width: 23,
    height: 23,
    borderRadius: 11.5,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },

  /* Reassurance Banner */
  reassuranceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3EEFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5DBFA',
  },
  reassuranceText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: PURPLE_DEEP,
  },

  /* Order Summary Card */
  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(26, 16, 64, 0.04)' } as any,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
  },
  summaryValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  summaryValueFree: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: OK,
  },
  summaryValueDiscount: {
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
    paddingHorizontal: 20,
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
  ctaDisabled: {
    opacity: 0.5,
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

  /* Loading & Empty States */
  skel: {
    backgroundColor: '#EBE7F5',
    borderRadius: 12,
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
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  primaryBtn: {
    marginTop: 12,
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
});
