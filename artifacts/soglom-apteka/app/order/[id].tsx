import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { localizeError } from '@/lib/i18n/errors';
import {
  deliveryStatusLabel,
  formatCountdown,
  fulfillmentLabel,
  fulfillmentTypeLabel,
  paymentLabel,
  paymentMethodLabel,
  reservationLabel,
} from '@/lib/orderLabels';

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

const PRODUCT_IMAGES: Record<string, any> = {
  'cat-p1': require('../../assets/images/cat-p1-d3.png'),
  'cat-p2': require('../../assets/images/cat-p2-c.png'),
  'cat-p3': require('../../assets/images/cat-p3-mg.png'),
  'cat-p4': require('../../assets/images/cat-p4-omega.png'),
  'cat-p5': require('../../assets/images/cat-p5-zn.png'),
  'cat-p6': require('../../assets/images/cat-p6-para.png'),
};

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\s*\(Demo\)/gi, '')
    .replace(/\[TEST\s*\/\s*DEMO\]\s*/gi, '')
    .replace(/\s*Ushbu ma'lumot staging sinov muhiti uchun demo hisoblanadi\.?\s*Haqiqiy dori narxi va zaxirasi emas\.?/gi, '')
    .trim();
}

function getProductThumb(item?: { productId?: number | string; id?: number | string; title?: string; name?: string; analogGroup?: string }) {
  if (!item) return null;
  const id = Number(item.productId ?? item.id);
  if (id === 1) return PRODUCT_IMAGES['cat-p1'];
  if (id === 2) return PRODUCT_IMAGES['cat-p2'];
  if (id === 3) return PRODUCT_IMAGES['cat-p3'];
  if (id === 4) return PRODUCT_IMAGES['cat-p4'];
  if (id === 5) return PRODUCT_IMAGES['cat-p5'];
  if (id === 6 || id === 7 || id === 8) return PRODUCT_IMAGES['cat-p6'];

  const name = String(item.title || item.name || '').toLowerCase();
  const group = String(item.analogGroup || '').toLowerCase();
  if (name.includes('d3') || group.includes('vitamin-d')) return PRODUCT_IMAGES['cat-p1'];
  if (name.includes('ascorb') || group.includes('vitamin-c')) return PRODUCT_IMAGES['cat-p2'];
  if (name.includes('magne') || group.includes('magnesium')) return PRODUCT_IMAGES['cat-p3'];
  if (name.includes('omega') || group.includes('omega')) return PRODUCT_IMAGES['cat-p4'];
  if (name.includes('sink') || name.includes('zinc') || group.includes('zinc')) return PRODUCT_IMAGES['cat-p5'];
  if (name.includes('para') || name.includes('ibup') || name.includes('nuro') || group.includes('analgesic')) return PRODUCT_IMAGES['cat-p6'];

  return null;
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad' | 'muted' | 'purple';
}) {
  const color =
    tone === 'ok'
      ? OK
      : tone === 'warn'
        ? WARN
        : tone === 'bad'
          ? BAD
          : tone === 'purple'
            ? PURPLE
            : PURPLE_DEEP;
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { refresh, t, fmt } = useApp();
  const narrow = width < 390;
  const contentWidth = Math.min(width, 440);

  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const onCopyCode = async () => {
    if (!order?.code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(String(order.code));
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  };

  const skewRef = useRef(0);
  const loadGen = useRef(0);
  const loadingRef = useRef(false);
  const cancellingRef = useRef(false);
  const orderRef = useRef<any>(null);
  orderRef.current = order;

  const load = useCallback(async (opts?: { forceSkeleton?: boolean }) => {
    if (loadingRef.current && !opts?.forceSkeleton) return;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setError(t('common.errorNotFound'));
      setLoading(false);
      return;
    }
    const gen = ++loadGen.current;
    loadingRef.current = true;
    if (opts?.forceSkeleton || !orderRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.order(orderId);
      if (gen !== loadGen.current) return;
      const o = data.order;
      setOrder(o);
      setError(null);
      if (o?.serverTime) {
        const serverMs = new Date(o.serverTime).getTime();
        if (Number.isFinite(serverMs)) skewRef.current = serverMs - Date.now();
      }
    } catch (e) {
      if (gen !== loadGen.current) return;
      setError(localizeError(e, t, { fallback: 'orders.detailLoadFailed' }));
      if (!orderRef.current) setOrder(null);
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
        loadingRef.current = false;
      }
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      void load({ forceSkeleton: !orderRef.current });
      return () => {
        loadGen.current += 1;
      };
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!order?.reservedUntil || !order.reservationActive) {
      setMsLeft(null);
      return;
    }
    const until = new Date(order.reservedUntil).getTime();
    if (!Number.isFinite(until)) {
      setMsLeft(null);
      return;
    }
    const tick = () => {
      const nowApprox = Date.now() + skewRef.current;
      const left = until - nowApprox;
      setMsLeft(left);
      if (left <= 0) void load();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [order?.reservedUntil, order?.reservationActive, order?.id, load]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/purchases');
  };

  const onCancel = async () => {
    if (!order?.canCancel || cancellingRef.current || cancelling) return;
    const message =
      order.paymentStatus === 'PAID'
        ? t('orders.cancelConfirmPaid')
        : t('orders.cancelConfirmUnpaid');

    const run = async () => {
      cancellingRef.current = true;
      setCancelling(true);
      try {
        await api.cancelOrder(order.id);
        await refresh();
        await load({ forceSkeleton: false });
        notify(t('orders.cancelSuccessTitle'), t('orders.cancelSuccessMessage'));
      } catch (e) {
        notify(t('common.errorTitle'), localizeError(e, t, { fallback: 'orders.cancelFailed' }));
        await load({ forceSkeleton: false });
      } finally {
        cancellingRef.current = false;
        setCancelling(false);
      }
    };

    const ok = await confirmAction({
      title: t('orders.cancelConfirmTitle'),
      message,
      confirmText: t('orders.cancelOrder'),
      cancelText: t('common.no'),
      destructive: true,
    });
    if (ok) void run();
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12);
  const sidePad = narrow ? 14 : 20;

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
          {t('orders.orderLabel')}
        </Text>
        {order?.code ? (
          <Text style={styles.headerSub} numberOfLines={1}>
            {String(order.code)}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={styles.iconBtn}
        onPress={() => void load()}
        disabled={refreshing || loading}
        accessibilityRole="button"
        accessibilityLabel={t('orders.detailRefreshA11y')}
        accessibilityState={{ disabled: refreshing || loading }}
      >
        {refreshing ? (
          <ActivityIndicator color={PURPLE} size="small" />
        ) : (
          <Feather name="refresh-cw" size={18} color={PURPLE} />
        )}
      </Pressable>
    </View>
  );

  if (loading && !order) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <ActivityIndicator color={PURPLE} size="large" />
          <Text style={styles.stateHint}>{t('orders.detailLoading')}</Text>
        </View>
      </View>
    );
  }

  if (error && !order) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <Feather name="cloud-off" size={36} color={MUTED} />
          <Text style={styles.stateTitle}>{t('orders.detailLoadFailed')}</Text>
          <Text style={styles.stateHint}>
            {t('orders.checkInternetHint')}
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => void load({ forceSkeleton: true })}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.primaryBtnText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!order) return null;

  const pay = String(order.paymentStatus || '').toUpperCase();
  const fulfill = String(order.fulfillmentStatus || '').toUpperCase();
  const resExpired =
    Boolean(order.reservationExpired)
    || (msLeft != null && msLeft <= 0 && String(order.reservationStatus).toUpperCase() === 'ACTIVE');
  const items = Array.isArray(order.items) ? order.items : [];
  const isDelivery = order.fulfillment === 'delivery';
  const showEarned =
    fulfill === 'COMPLETED'
    && Number(order.cashbackEarned) > 0;
  const usedCashback = Number(order.cashbackUsed) > 0 ? Number(order.cashbackUsed) : 0;

  const payTone: 'ok' | 'warn' | 'bad' | 'muted' | 'purple' =
    pay === 'PAID' ? 'ok' : pay === 'FAILED' ? 'bad' : pay === 'PENDING' ? 'warn' : 'muted';
  const fulfillTone: 'ok' | 'warn' | 'bad' | 'muted' | 'purple' =
    fulfill === 'COMPLETED'
      ? 'ok'
      : fulfill === 'CANCELLED'
        ? 'bad'
        : fulfill === 'OUT_FOR_DELIVERY' || fulfill === 'READY_FOR_PICKUP'
          ? 'purple'
          : fulfill === 'PREPARING' || fulfill === 'CONFIRMED' || fulfill === 'CREATED'
            ? 'warn'
            : 'muted';
  const resTone: 'ok' | 'warn' | 'bad' | 'muted' | 'purple' = resExpired
    ? 'warn'
    : String(order.reservationStatus).toUpperCase() === 'FULFILLED'
      ? 'ok'
      : String(order.reservationStatus).toUpperCase() === 'CANCELLED'
        ? 'bad'
        : String(order.reservationStatus).toUpperCase() === 'ACTIVE'
          ? 'purple'
          : 'muted';

  const showReservation =
    resExpired
    || ['ACTIVE', 'EXPIRED', 'CANCELLED', 'FULFILLED'].includes(
      String(order.reservationStatus || '').toUpperCase(),
    );

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
            paddingBottom: 28 + bottomPad,
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
        {/* Current status — clean hero card without duplicate labels */}
        <View style={styles.card}>
          <View style={styles.statusHeaderRow}>
            <View
              style={[
                styles.statusIconCircle,
                {
                  backgroundColor:
                    fulfillTone === 'ok' ? '#ECFDF5' : fulfillTone === 'bad' ? '#FEF2F2' : '#F5F3FF',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={
                  fulfill === 'COMPLETED'
                    ? 'check-circle-outline'
                    : fulfill === 'CANCELLED'
                      ? 'close-circle-outline'
                      : fulfill === 'OUT_FOR_DELIVERY'
                        ? 'truck-delivery-outline'
                        : fulfill === 'READY_FOR_PICKUP'
                          ? 'storefront-outline'
                          : 'clock-outline'
                }
                size={24}
                color={fulfillTone === 'ok' ? OK : fulfillTone === 'bad' ? BAD : PURPLE}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardSectionLabel}>{t('orders.statusCardTitle')}</Text>
              <Text
                style={[
                  styles.statusHeroValue,
                  { color: fulfillTone === 'ok' ? OK : fulfillTone === 'bad' ? BAD : PURPLE_DEEP },
                ]}
                numberOfLines={1}
              >
                {fulfillmentLabel(t, order.fulfillmentStatus)}
              </Text>
            </View>
          </View>
          <View style={styles.statusDivider} />

          {order.createdAt ? (
            <StatusRow
              label={t('orders.orderDate')}
              value={fmt.date(order.createdAt, { withTime: true })}
            />
          ) : null}
          {order.paymentMethod ? (
            <StatusRow
              label={t('orders.orderPaymentMethod')}
              value={paymentMethodLabel(t, order.paymentMethod)}
            />
          ) : null}
          {fulfill !== 'CANCELLED' || pay === 'PAID' || pay === 'REFUNDED' || pay === 'PARTIALLY_REFUNDED' ? (
            <StatusRow
              label={t('orders.statusRowPayment')}
              value={paymentLabel(t, order.paymentStatus)}
              tone={payTone}
            />
          ) : null}
          {showReservation && fulfill !== 'CANCELLED' ? (
            <StatusRow
              label={t('orders.statusRowReservation')}
              value={reservationLabel(t, order.reservationStatus, resExpired)}
              tone={resTone}
            />
          ) : null}
          {pay === 'PENDING' && fulfill !== 'CANCELLED' ? (
            <View style={styles.infoBanner}>
              <Feather name="info" size={15} color={WARN} style={{ marginTop: 1 }} />
              <Text style={styles.infoBannerText}>
                {t('orders.notePaymentPending')}
              </Text>
            </View>
          ) : null}
          {pay === 'FAILED' && fulfill !== 'CANCELLED' ? (
            <View style={styles.badBanner}>
              <Feather name="alert-triangle" size={15} color={BAD} style={{ marginTop: 1 }} />
              <Text style={styles.badBannerText}>
                {t('orders.notePaymentFailed')}
              </Text>
            </View>
          ) : null}
        </View>

        {order.reservationActive && order.reservedUntil && msLeft != null && msLeft > 0 ? (
          <View style={styles.countdownCard}>
            <View style={styles.countdownLeft}>
              <View style={styles.countdownIconWrap}>
                <Feather name="clock" size={18} color={PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.countdownLabel}>{t('orders.countdownLabel')}</Text>
                <Text style={styles.countdownSub}>{t('orders.countdownNote')}</Text>
              </View>
            </View>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownValue}>{formatCountdown(msLeft)}</Text>
            </View>
          </View>
        ) : null}

        {resExpired && fulfill !== 'CANCELLED' && fulfill !== 'COMPLETED' ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>
              {t('orders.reservationExpiredWarn')}
            </Text>
          </View>
        ) : null}

        {/* Fulfillment & Location Unified */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <MaterialCommunityIcons
                name={isDelivery ? 'truck-delivery-outline' : 'storefront-outline'}
                size={20}
                color={PURPLE}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardSectionLabel}>{t('orders.fulfillmentCardTitle')}</Text>
              <Text style={styles.bodyStrong}>
                {fulfillmentTypeLabel(t, isDelivery ? 'delivery' : 'pickup')}
              </Text>
            </View>
          </View>

          {isDelivery ? (
            <View style={styles.deliveryDetails}>
              {order.address ? (
                <View style={styles.detailRow}>
                  <Feather name="map-pin" size={15} color={MUTED} style={styles.detailIcon} />
                  <Text style={styles.meta} numberOfLines={3}>
                    {t('orders.addressLine', { address: String(order.address) })}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.deliveryNotice}>
                {t('orders.deliveryUpdatesNote')}
              </Text>
              {order.delivery?.status ? (
                <View style={styles.detailRow}>
                  <Feather name="activity" size={15} color={MUTED} style={styles.detailIcon} />
                  <Text style={styles.meta}>
                    {t('orders.deliveryStatusLine', { status: deliveryStatusLabel(t, order.delivery.status) })}
                    {order.delivery.timeWindow ? ` · ${String(order.delivery.timeWindow)}` : ''}
                  </Text>
                </View>
              ) : null}
              {order.delivery?.courierName ? (
                <View style={styles.detailRow}>
                  <Feather name="user" size={15} color={PURPLE_DEEP} style={styles.detailIcon} />
                  <Text style={[styles.meta, { color: PURPLE_DEEP, fontWeight: '600' }]}>
                    {t('orders.courierInfoLine', { name: String(order.delivery.courierName) })}
                  </Text>
                </View>
              ) : null}
              {order.delivery?.courierPhone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${order.delivery.courierPhone}`)}
                  style={styles.detailRow}
                  accessibilityRole="link"
                  accessibilityLabel={t('orders.courierPhoneLine', { phone: String(order.delivery.courierPhone) })}
                >
                  <Feather name="phone" size={15} color={PURPLE} style={styles.detailIcon} />
                  <Text style={[styles.meta, { color: PURPLE, fontWeight: '600' }]}>
                    {t('orders.courierPhoneLine', { phone: String(order.delivery.courierPhone) })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : order.branch?.name ? (
            <View style={styles.branchDetails}>
              <View style={styles.statusDivider} />
              <Text style={styles.branchName} numberOfLines={2}>
                {String(order.branch.name)}
              </Text>
              {order.branch.address ? (
                <View style={styles.detailRow}>
                  <Feather name="map-pin" size={14} color={MUTED} style={styles.detailIcon} />
                  <Text style={styles.branchAddress} numberOfLines={2}>
                    {String(order.branch.address)}
                  </Text>
                </View>
              ) : null}
              {order.branch.hours ? (
                <View style={styles.detailRow}>
                  <Feather name="clock" size={14} color={MUTED} style={styles.detailIcon} />
                  <Text style={styles.branchHours} numberOfLines={1}>
                    {String(order.branch.hours)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.branchActionsRow}>
                {order.branch.lat && order.branch.lng ? (
                  <Pressable
                    style={styles.branchActionBtn}
                    onPress={() => {
                      const url = `https://yandex.com/maps/?rtext=~${order.branch.lat},${order.branch.lng}&rtt=auto`;
                      void Linking.openURL(url);
                    }}
                    accessibilityRole="link"
                    accessibilityLabel={t('orders.branchOpenMap')}
                  >
                    <Feather name="navigation" size={14} color={PURPLE} />
                    <Text style={styles.branchActionText}>{t('orders.branchOpenMap')}</Text>
                  </Pressable>
                ) : null}
                {order.branch.phone ? (
                  <Pressable
                    style={styles.branchActionBtn}
                    onPress={() => void Linking.openURL(`tel:${order.branch.phone}`)}
                    accessibilityRole="link"
                    accessibilityLabel={t('orders.branchCall')}
                  >
                    <Feather name="phone" size={14} color={PURPLE} />
                    <Text style={styles.branchActionText}>{t('orders.branchCall')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        {/* Real Scannable Digital Ticket & QR Code */}
        {fulfill !== 'CANCELLED' && !resExpired && order.qrPayload ? (
          <View style={styles.ticketCard}>
            {/* Top Purple Ticket Header */}
            <View style={styles.ticketHeader}>
              <View style={styles.ticketHeaderLeft}>
                <View style={styles.ticketKickerPill}>
                  <MaterialCommunityIcons name="shield-check-outline" size={12} color="#FFFFFF" />
                  <Text style={styles.ticketKickerText}>{t('orders.qrScanTitle')}</Text>
                </View>
                <Text style={styles.ticketCodeHero} numberOfLines={1}>
                  {String(order.code || order.qrPayload)}
                </Text>
              </View>
              <View style={styles.ticketStatusPill}>
                <Text style={styles.ticketStatusText}>
                  {fulfillmentLabel(t, order.fulfillmentStatus)}
                </Text>
              </View>
            </View>

            {/* Perforation Row with Circular Notches */}
            <View style={styles.perforationRow}>
              <View style={styles.notchLeft} />
              <View style={styles.dashedDivider} />
              <View style={styles.notchRight} />
            </View>

            {/* Ticket Body with Scannable QR Code */}
            <View style={styles.ticketBody}>
              <Text style={styles.ticketHintText}>
                {t('orders.qrHint')}
              </Text>

              <View style={styles.qrContainer}>
                <QRCode
                  value={String(order.qrPayload)}
                  size={172}
                  color={PURPLE_DEEP}
                  backgroundColor="#FFFFFF"
                  ecl="M"
                  quietZone={8}
                />
              </View>

              {/* Formatted Code & Copy Button */}
              <View style={styles.ticketCodeRow}>
                <Text style={styles.ticketCodeValue} numberOfLines={1}>
                  {String(order.code || order.qrPayload)}
                </Text>
                <Pressable
                  style={[styles.ticketCopyBtn, copied && styles.ticketCopyBtnActive]}
                  onPress={() => void onCopyCode()}
                  accessibilityRole="button"
                  accessibilityLabel={copied ? t('orders.copiedCode') : t('orders.copyCode')}
                >
                  <Feather name={copied ? 'check' : 'copy'} size={13} color={copied ? '#FFFFFF' : PURPLE} />
                  <Text style={[styles.ticketCopyBtnText, copied && { color: '#FFFFFF' }]}>
                    {copied ? t('orders.copiedCode') : t('orders.copyCode')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* Items */}
        <Text style={styles.sectionTitle}>{t('orders.items')}</Text>
        {items.map((item: any) => {
          const qty = Math.max(1, Number(item.quantity) || 1);
          const unit = Number(item.price) || 0;
          const line = unit * qty;
          const thumb = getProductThumb(item);
          return (
            <View key={item.id ?? `${item.productId}-${item.title}`} style={styles.lineCard}>
              <View style={styles.lineThumbWrap}>
                {thumb ? (
                  <Image source={thumb} style={styles.lineThumb} resizeMode="contain" />
                ) : (
                  <MaterialCommunityIcons name="pill" size={20} color={PURPLE} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {cleanText(String(item.title || t('orders.itemUntitled')))}
                </Text>
                <Text style={styles.lineMeta}>
                  {t('orders.lineQtyPrice', { qty, price: fmt.money(unit) })}
                </Text>
              </View>
              <Text style={styles.lineTotal} numberOfLines={1}>
                {fmt.money(line)}
              </Text>
            </View>
          );
        })}

        {/* Money + cashback */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.summaryTitle')}</Text>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>{t('orders.items')}</Text>
            <Text style={styles.moneyValue}>{fmt.money(Number(order.subtotal) || 0)}</Text>
          </View>
          {Number(order.deliveryFee) > 0 ? (
            <View style={styles.moneyRow}>
              <Text style={styles.moneyLabel}>{t('orders.summaryDelivery')}</Text>
              <Text style={styles.moneyValue}>{fmt.money(Number(order.deliveryFee) || 0)}</Text>
            </View>
          ) : null}
          {usedCashback > 0 ? (
            <View style={styles.moneyRow}>
              <Text style={styles.moneyLabel}>{t('orders.summaryCashbackUsed')}</Text>
              <Text style={[styles.moneyValue, { color: WARN }]}>−{fmt.money(usedCashback)}</Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          <View style={styles.moneyRow}>
            <Text style={styles.moneyTotalLabel}>{t('orders.summaryTotal')}</Text>
            <Text style={styles.moneyTotalValue}>{fmt.money(Number(order.total) || 0)}</Text>
          </View>
          {showEarned ? (
            <Text style={styles.earnNote}>
              {t('orders.cashbackEarnedLine', { amount: fmt.money(Number(order.cashbackEarned) || 0) })}
            </Text>
          ) : Number(order.cashbackEarned) > 0 && fulfill !== 'COMPLETED' ? (
            <Text style={styles.meta}>
              {t('orders.cashbackPending')}
            </Text>
          ) : null}
        </View>

        {/* Soliq OFD elektron fiskal chek */}
        {order.fiscalCheque ? (
          <View style={[styles.card, { borderColor: '#E0E7FF', backgroundColor: '#F8FAFC' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Feather name="file-text" size={16} color={PURPLE_DEEP} />
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>
                {t('orders.fiscalChequeTitle')}
              </Text>
            </View>
            <Text style={styles.meta}>
              {t('orders.fiscalChequeNumber', { number: String(order.fiscalCheque.receiptNumber) })}
            </Text>
            <Text style={styles.meta}>
              {t('orders.fiscalChequeSign', { sign: String(order.fiscalCheque.fiscalSign) })}
            </Text>
            {order.fiscalCheque.qrUrl ? (
              <Pressable
                style={[styles.primaryBtn, { marginTop: 10, backgroundColor: '#0284C7' }]}
                onPress={() => void Linking.openURL(String(order.fiscalCheque.qrUrl))}
                accessibilityRole="link"
                accessibilityLabel={t('orders.fiscalChequeVerify')}
              >
                <Text style={styles.primaryBtnText}>{t('orders.fiscalChequeVerify')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        {order.canCancel ? (
          <Pressable
            style={[styles.cancelBtn, cancelling && { opacity: 0.55 }]}
            disabled={cancelling}
            onPress={() => void onCancel()}
            accessibilityRole="button"
            accessibilityState={{ disabled: cancelling }}
            accessibilityLabel={t('orders.cancelOrderA11y')}
          >
            {cancelling ? (
              <ActivityIndicator color={BAD} />
            ) : (
              <Text style={styles.cancelBtnText}>{t('orders.cancelOrder')}</Text>
            )}
          </Pressable>
        ) : null}

        {order.canRate ? (
          <Pressable
            style={styles.primaryBtn}
            onPress={() =>
              router.push({ pathname: '/rating', params: { orderId: String(order.id) } })
            }
            accessibilityRole="button"
            accessibilityLabel={t('orders.rateCta')}
          >
            <Text style={styles.primaryBtnText}>{t('orders.rateCta')}</Text>
          </Pressable>
        ) : null}
        {order.alreadyRated ? (
          <Text style={[styles.meta, { textAlign: 'center', marginTop: 8 }]}>
            {t('orders.alreadyRatedNote')}
          </Text>
        ) : null}

        {/* Support link */}
        <Pressable
          style={styles.supportBtn}
          onPress={() => router.push('/help')}
          accessibilityRole="button"
          accessibilityLabel={t('orders.contactSupport')}
        >
          <Feather name="help-circle" size={16} color={PURPLE} />
          <Text style={styles.supportBtnText}>{t('orders.needHelp')}</Text>
        </Pressable>

        <Pressable
          style={styles.linkBtn}
          onPress={() => router.replace('/(tabs)/purchases')}
          accessibilityRole="button"
          accessibilityLabel={t('orders.backToOrdersA11y')}
        >
          <Text style={styles.linkBtnText}>{t('orders.backToOrders')}</Text>
        </Pressable>
        <Pressable
          style={[styles.linkBtn, { marginBottom: 8 }]}
          onPress={() => router.replace('/(tabs)/catalog')}
          accessibilityRole="button"
          accessibilityLabel={t('orders.backToCatalog')}
        >
          <Text style={styles.linkBtnText}>{t('orders.backToCatalog')}</Text>
        </Pressable>
      </ScrollView>
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
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    boxShadow: '0 2px 8px rgba(26, 16, 64, 0.05)',
    zIndex: 10,
  },
  headerCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: PURPLE_DEEP,
  },
  headerSub: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    marginBottom: 12,
    boxShadow: '0 2px 10px rgba(26, 16, 64, 0.04)',
  },
  cardSectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    marginBottom: 2,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  statusIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusHeroValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    lineHeight: 23,
  },
  statusDivider: {
    height: 1,
    backgroundColor: '#F1ECF8',
    marginVertical: 10,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
    marginBottom: 10,
  },
  cardLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
  },
  bodyStrong: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  meta: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
  },

  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  statusLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    flexShrink: 0,
  },
  statusValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 8,
  },
  infoBannerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  badBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 8,
  },
  badBannerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: BAD,
    lineHeight: 16,
  },

  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9F5FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(106, 34, 214, 0.05)',
  },
  countdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  countdownIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  countdownSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
    marginTop: 1,
  },
  countdownBadge: {
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    boxShadow: '0 2px 6px rgba(106, 34, 214, 0.25)',
  },
  countdownValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  warnCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  warnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: WARN,
    lineHeight: 18,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryDetails: { marginTop: 10 },
  deliveryNotice: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    marginTop: 4,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  detailIcon: { flexShrink: 0 },
  branchDetails: { marginTop: 6 },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    marginBottom: 4,
  },
  branchAddress: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: MUTED,
    lineHeight: 17,
  },
  branchHours: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: PURPLE,
  },
  branchActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  branchActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  branchActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },

  ticketCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(106, 34, 214, 0.12)',
  },
  ticketHeader: {
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketHeaderLeft: {
    gap: 4,
    flex: 1,
  },
  ticketKickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  ticketKickerText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  ticketCodeHero: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  ticketStatusPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  ticketStatusText: {
    color: PURPLE,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },

  perforationRow: {
    height: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  notchLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BG,
    position: 'absolute',
    left: -10,
  },
  dashedDivider: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderStyle: 'dashed',
    marginHorizontal: 16,
  },
  notchRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BG,
    position: 'absolute',
    right: -10,
  },

  ticketBody: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingBottom: 20,
    paddingTop: 4,
    alignItems: 'center',
  },
  ticketHintText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 12,
  },
  qrContainer: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#ECE7F6',
    boxShadow: '0 4px 12px rgba(26, 16, 64, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8F6FD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    marginTop: 16,
  },
  ticketCodeValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    letterSpacing: 1.2,
    color: PURPLE_DEEP,
  },
  ticketCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8B4FE',
  },
  ticketCopyBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  ticketCopyBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: PURPLE,
  },

  sectionTitle: {
    marginBottom: 8,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    boxShadow: '0 2px 6px rgba(26, 16, 64, 0.03)',
  },
  lineThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8F5FC',
    borderWidth: 1,
    borderColor: '#ECE7F6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lineThumb: {
    width: 38,
    height: 38,
  },
  lineName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  lineMeta: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  lineTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
    flexShrink: 0,
  },

  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  moneyLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: MUTED, flex: 1 },
  moneyValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: PURPLE_DEEP },
  moneyTotalLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, color: PURPLE_DEEP },
  moneyTotalValue: { fontFamily: 'Inter_700Bold', fontSize: 16, color: PURPLE_DEEP },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginVertical: 6,
  },
  earnNote: {
    marginTop: 6,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: OK,
  },

  cancelBtn: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BAD,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
  },
  cancelBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: BAD,
  },
  primaryBtn: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    boxShadow: '0 3px 12px rgba(106, 34, 214, 0.25)',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
  },
  supportBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  linkBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
  linkBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE,
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
    fontSize: 17,
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
});
