import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import { api } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import { localizeError } from '@/lib/i18n/errors';
import {
  deliveryStatusLabel,
  formatCountdown,
  fulfillmentLabel,
  fulfillmentTypeLabel,
  paymentLabel,
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
        showsVerticalScrollIndicator={false}
      >
        {/* Current status — honest single card, no fake timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.statusCardTitle')}</Text>
          <StatusRow
            label={t('orders.statusRowFulfillment')}
            value={fulfillmentLabel(t, order.fulfillmentStatus)}
            tone={fulfillTone}
          />
          <StatusRow
            label={t('orders.statusRowPayment')}
            value={paymentLabel(t, order.paymentStatus)}
            tone={payTone}
          />
          {showReservation ? (
            <StatusRow
              label={t('orders.statusRowReservation')}
              value={reservationLabel(t, order.reservationStatus, resExpired)}
              tone={resTone}
            />
          ) : null}
          {pay === 'PENDING' ? (
            <Text style={styles.noteWarn}>
              {t('orders.notePaymentPending')}
            </Text>
          ) : null}
          {pay === 'FAILED' ? (
            <Text style={styles.noteBad}>
              {t('orders.notePaymentFailed')}
            </Text>
          ) : null}
        </View>

        {order.reservationActive && order.reservedUntil && msLeft != null && msLeft > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('orders.countdownLabel')}</Text>
            <Text style={styles.countdown}>{formatCountdown(msLeft)}</Text>
            <Text style={styles.meta}>{t('orders.countdownNote')}</Text>
          </View>
        ) : null}

        {resExpired && fulfill !== 'CANCELLED' && fulfill !== 'COMPLETED' ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>
              {t('orders.reservationExpiredWarn')}
            </Text>
          </View>
        ) : null}

        {/* Fulfillment */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.fulfillmentCardTitle')}</Text>
          <Text style={styles.bodyStrong}>
            {fulfillmentTypeLabel(t, isDelivery ? 'delivery' : 'pickup')}
          </Text>
          {isDelivery ? (
            <>
              {order.address ? (
                <Text style={styles.meta} numberOfLines={3}>
                  {t('orders.addressLine', { address: String(order.address) })}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {t('orders.deliveryUpdatesNote')}
              </Text>
              {order.delivery?.status ? (
                <Text style={styles.meta}>
                  {t('orders.deliveryStatusLine', { status: deliveryStatusLabel(t, order.delivery.status) })}
                  {order.delivery.timeWindow ? ` · ${String(order.delivery.timeWindow)}` : ''}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Branch */}
        {order.branch?.name ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('orders.branchCardTitle')}</Text>
            <Text style={styles.bodyStrong} numberOfLines={2}>
              {String(order.branch.name)}
            </Text>
            {order.branch.address ? (
              <Text style={styles.meta} numberOfLines={2}>
                {String(order.branch.address)}
              </Text>
            ) : null}
            {order.branch.hours ? (
              <Text style={styles.meta} numberOfLines={1}>
                {String(order.branch.hours)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* QR for pickup/active */}
        {fulfill !== 'CANCELLED' && !resExpired && order.qrPayload ? (
          <View style={styles.qrCard}>
            <Text style={styles.qrCode} numberOfLines={1}>
              {String(order.qrPayload)}
            </Text>
            <Text style={styles.qrHint}>{t('orders.qrHint')}</Text>
          </View>
        ) : null}

        {/* Items */}
        <Text style={styles.sectionTitle}>{t('orders.items')}</Text>
        {items.map((item: any) => {
          const qty = Math.max(1, Number(item.quantity) || 1);
          const unit = Number(item.price) || 0;
          const line = unit * qty;
          return (
            <View key={item.id ?? `${item.productId}-${item.title}`} style={styles.lineCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {String(item.title || t('orders.itemUntitled'))}
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
  root: { flex: 1, backgroundColor: BG, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
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
  noteWarn: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: WARN,
  },
  noteBad: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: BAD,
  },

  countdown: {
    marginTop: 6,
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: PURPLE,
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

  qrCard: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
  },
  qrCode: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  qrHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
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
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
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
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  linkBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
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
