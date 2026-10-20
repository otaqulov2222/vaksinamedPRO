import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { TranslationKey } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';
import type { Formatters } from '@/lib/i18n/format';
import {
  isFulfillmentCancelled,
  isFulfillmentDelivered,
  fulfillmentLabel,
  fulfillmentTypeLabel,
  paymentLabelShort,
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

type FilterKey = 'all' | 'progress' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; labelKey: TranslationKey }[] = [
  { key: 'all', labelKey: 'common.all' },
  { key: 'progress', labelKey: 'orders.filterProgress' },
  { key: 'completed', labelKey: 'orders.filterCompleted' },
  { key: 'cancelled', labelKey: 'orders.filterCancelled' },
];

function isCompleted(order: any) {
  return isFulfillmentDelivered(order.fulfillmentStatus, order.status);
}
function isCancelled(order: any) {
  return isFulfillmentCancelled(order.fulfillmentStatus, order.status);
}
function isProgress(order: any) {
  return !isCompleted(order) && !isCancelled(order);
}

function formatWhen(fmt: Formatters, raw?: string) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return fmt.date(d, { withYear: d.getFullYear() !== new Date().getFullYear(), withTime: true });
}

function fulfillTone(status?: string): 'ok' | 'warn' | 'bad' | 'purple' | 'neutral' {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED') return 'ok';
  if (s === 'CANCELLED') return 'bad';
  if (s === 'OUT_FOR_DELIVERY' || s === 'READY_FOR_PICKUP') return 'purple';
  if (s === 'PREPARING' || s === 'CONFIRMED' || s === 'CREATED') return 'warn';
  return 'neutral';
}

function paymentTone(status?: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID') return 'ok';
  if (s === 'PENDING') return 'warn';
  if (s === 'FAILED') return 'bad';
  if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'neutral';
  return 'neutral';
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'ok' | 'warn' | 'bad' | 'purple';
}) {
  const palette =
    tone === 'ok'
      ? { bg: '#E8F5EE', fg: OK }
      : tone === 'warn'
        ? { bg: '#FEF3C7', fg: WARN }
        : tone === 'bad'
          ? { bg: '#FEE2E2', fg: BAD }
          : tone === 'purple'
            ? { bg: LAVENDER, fg: PURPLE }
            : { bg: '#F1EEF6', fg: MUTED };
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      <Text style={[styles.chipText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLineMid} />
      <View style={styles.skeletonChip} />
      <View style={styles.skeletonLineLong} />
      <View style={styles.skeletonFooter}>
        <View style={styles.skeletonLineShort} />
        <View style={styles.skeletonLinePrice} />
      </View>
    </View>
  );
}

function OrderCard({ order }: { order: any }) {
  const { t, fmt } = useApp();
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.length;
  const qtyTotal =
    items.reduce((s, it) => s + Math.max(1, Number(it.quantity) || 1), 0) || itemCount;
  const first = items[0];
  const firstTitle = String(first?.title || first?.nameUz || '').trim();
  const firstThumb = getProductThumb(first);
  const moreItems = Math.max(0, itemCount - 1);

  const pay = String(order.paymentStatus || '').toUpperCase();
  const fulfill = String(order.fulfillmentStatus || '');
  const fulfillText = fulfillmentLabel(t, order.fulfillmentStatus);
  const methodLabel = fulfillmentTypeLabel(t, order.fulfillment);
  const branchName = order.branch?.name ? String(order.branch.name) : '';
  const code = String(order.code || '').trim();
  const totalLabel = fmt.money(Math.max(0, Math.floor(Number(order.total) || 0)));
  const when = formatWhen(fmt, order.createdAt);
  const orderTitle = code ? t('orders.orderRef', { code }) : t('orders.orderLabel');

  const productLine = firstTitle
    ? firstTitle
    : qtyTotal > 0
      ? t('orders.itemsCount', { count: qtyTotal })
      : t('orders.items');
  const moreLine = moreItems > 0 ? t('orders.moreItems', { count: moreItems }) : null;

  const placeLine = [branchName, methodLabel].filter(Boolean).join(' · ');

  // Show secondary payment chip ONLY when customer action/attention is required
  const cancelled = isCancelled(order);
  const completed = isCompleted(order);
  const needsPaymentAttention = !cancelled && !completed && (pay === 'PENDING' || pay === 'FAILED');
  const payRefundLabel = cancelled && (pay === 'REFUNDED' || pay === 'PARTIALLY_REFUNDED') ? paymentLabelShort(t, order.paymentStatus) : null;
  const payUrgentLabel = needsPaymentAttention ? paymentLabelShort(t, order.paymentStatus) : payRefundLabel;

  const a11y = [
    orderTitle,
    fulfillText,
    payUrgentLabel,
    t('orders.totalA11y', { total: totalLabel }),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => {
        const id = Number(order.id);
        if (!Number.isFinite(id) || id <= 0) return;
        router.push(`/order/${id}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.card, pressed && styles.pressedSoft]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <Text style={styles.orderRef} numberOfLines={1}>
            {orderTitle}
          </Text>
          {when ? (
            <Text style={styles.orderWhen} numberOfLines={1}>
              {when}
            </Text>
          ) : null}
        </View>
        <StatusChip label={fulfillText} tone={fulfillTone(fulfill)} />
      </View>

      <View style={styles.productBlock}>
        <View style={styles.productIconWrap} importantForAccessibility="no-hide-descendants">
          {firstThumb ? (
            <Image
              source={firstThumb}
              style={styles.productThumb}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={styles.productIconFallback}>
              <MaterialCommunityIcons name="pill" size={20} color={PURPLE} />
            </View>
          )}
        </View>
        <View style={styles.productCopy}>
          <Text style={styles.productName} numberOfLines={2}>
            {productLine}
          </Text>
          {moreLine ? (
            <Text style={styles.productMore} numberOfLines={1}>
              {moreLine}
            </Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={18} color="#C4B5FD" style={styles.cardChevron} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          {placeLine ? (
            <View style={styles.metaWithIcon}>
              <Feather
                name={order.fulfillment === 'delivery' ? 'truck' : 'map-pin'}
                size={12}
                color={MUTED}
              />
              <Text style={styles.metaText} numberOfLines={1}>
                {placeLine}
              </Text>
            </View>
          ) : null}
          {qtyTotal > 0 ? (
            <Text style={styles.metaQtyText} numberOfLines={1}>
              {t('orders.itemsCount', { count: qtyTotal })}
            </Text>
          ) : null}
        </View>
        <View style={styles.totalCol}>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {totalLabel}
          </Text>
        </View>
      </View>

      {payUrgentLabel ? (
        <View style={styles.axisRow}>
          <StatusChip label={payUrgentLabel} tone={paymentTone(pay)} />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function PurchasesScreen() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < 390;
  const sidePad = narrow ? 14 : 16;

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const loadGen = useRef(0);
  const loadingRef = useRef(false);
  const ordersRef = useRef<any[]>([]);
  ordersRef.current = orders;

  const load = useCallback(async (opts?: { silent?: boolean; pull?: boolean }) => {
    if (loadingRef.current && opts?.silent) return;
    const gen = ++loadGen.current;
    loadingRef.current = true;
    const hasData = ordersRef.current.length > 0;
    const silent = Boolean(opts?.silent && hasData);
    const pull = Boolean(opts?.pull);

    if (pull) setRefreshing(true);
    else if (!silent) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const data = await api.orders();
      if (gen !== loadGen.current) return;
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setLoadError(null);
    } catch (e) {
      if (gen !== loadGen.current) return;
      if (!silent && !hasData) setOrders([]);
      setLoadError(localizeError(e, t, { fallback: 'orders.listLoadFailed' }));
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
        loadingRef.current = false;
      }
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
      return () => {
        loadGen.current += 1;
      };
    }, [load]),
  );

  const counts = useMemo(() => {
    const all = orders.length;
    const progress = orders.filter((o) => isProgress(o)).length;
    const completed = orders.filter((o) => isCompleted(o)).length;
    const cancelled = orders.filter((o) => isCancelled(o)).length;
    return { all, progress, completed, cancelled };
  }, [orders]);

  const visible = useMemo(() => {
    return orders.filter((o) => {
      if (filter === 'progress' && !isProgress(o)) return false;
      if (filter === 'completed' && !isCompleted(o)) return false;
      if (filter === 'cancelled' && !isCancelled(o)) return false;
      return true;
    });
  }, [orders, filter]);

  const countFor = (key: FilterKey) => {
    if (key === 'all') return counts.all;
    if (key === 'progress') return counts.progress;
    if (key === 'completed') return counts.completed;
    return counts.cancelled;
  };

  const topPad = Platform.OS === 'web' ? 16 : Math.max(insets.top, 16) + 4;
  const tabClearance = Platform.OS === 'web' ? 96 : 80;
  const bottomPad = 28 + Math.max(insets.bottom, 8) + tabClearance;

  const showInitialLoad = loading && orders.length === 0 && !loadError;
  const showError = Boolean(loadError) && orders.length === 0 && !loading;
  const showEmpty = !loading && !loadError && orders.length === 0;
  const showList = orders.length > 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.pageTitle} accessibilityRole="header">
          {t('common.navOrders')}
        </Text>
        <Text style={styles.pageSubtitle}>
          {t('orders.listSubtitle')}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: sidePad, paddingBottom: bottomPad },
          showEmpty || showError ? styles.contentCompact : null,
        ]}
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          showList || showEmpty || showError ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ pull: true })}
              tintColor={PURPLE}
              colors={[PURPLE]}
            />
          ) : undefined
        }
      >
        {showInitialLoad ? (
          <>
            {header}
            <View style={styles.skeletonList}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          </>
        ) : showError ? (
          <>
            {header}
            <View style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <Feather name="cloud-off" size={22} color={MUTED} />
              </View>
              <Text style={styles.stateTitle}>{t('orders.listLoadFailed')}</Text>
              <Text style={styles.stateText}>
                {t('orders.checkInternetHint')}
              </Text>
              <Pressable
                onPress={() => void load()}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressedSoft]}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
              >
                <Feather name="refresh-cw" size={15} color="#FFFFFF" />
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          </>
        ) : showEmpty ? (
          <>
            {header}
            <View style={styles.emptyCard}>
              <Image
                source={require('../../assets/images/orders-empty-premium.png')}
                style={styles.emptyArt}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={120}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={styles.emptyTitle}>{t('orders.emptyTitle')}</Text>
              <Text style={styles.emptyText}>
                {t('orders.emptyText')}
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/catalog')}
                style={({ pressed }) => [styles.primaryCta, pressed && styles.pressedSoft]}
                accessibilityRole="button"
                accessibilityLabel={t('orders.emptyCta')}
              >
                <MaterialCommunityIcons name="shopping-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryCtaText}>{t('orders.emptyCta')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {header}

            <View style={[styles.filtersContainer, { marginHorizontal: -sidePad, paddingHorizontal: sidePad }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                directionalLockEnabled
                alwaysBounceVertical={false}
                bounces={false}
                contentContainerStyle={[styles.filters, { paddingRight: 4 }]}
                style={styles.filtersScroll}
              >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const n = countFor(f.key);
                const label = t(f.labelKey);
                return (
                  <Pressable
                    key={f.key}
                    style={[styles.filterChip, active && styles.filterChipOn]}
                    onPress={() => setFilter(f.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t('orders.filterA11y', { label, count: n })}
                  >
                    <Text style={[styles.filterLabel, active && styles.filterLabelOn]}>{label}</Text>
                    <View style={[styles.filterBadge, active && styles.filterBadgeOn]}>
                      <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextOn]}>
                        {n}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              </ScrollView>
            </View>

            {visible.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>{t('orders.filterEmptyTitle')}</Text>
                <Text style={styles.stateText}>{t('orders.filterEmptyText')}</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {visible.map((o) => (
                  <OrderCard key={String(o.id)} order={o} />
                ))}
              </View>
            )}

            {loadError ? (
              <Text style={styles.inlineError} numberOfLines={2}>
                {t('orders.listRefreshFailed')}
              </Text>
            ) : null}
          </>
        )}
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
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
  },
  content: {
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  contentCompact: {
    flexGrow: 0,
  },

  header: {
    marginBottom: 12,
  },
  headerText: { minWidth: 0 },
  pageTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: PURPLE_DEEP,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
  },

  filtersContainer: {
    marginBottom: 14,
    alignSelf: 'stretch',
    width: Platform.OS === 'web' ? ('auto' as any) : undefined,
    overflow: 'hidden',
  },
  filtersScroll: {
    flexGrow: 0,
    width: '100%',
  },
  filters: {
    gap: 8,
    paddingBottom: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterChipOn: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  filterLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
    color: '#64748B',
  },
  filterLabelOn: { color: '#FFFFFF' },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  filterBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
    color: PURPLE,
  },
  filterBadgeTextOn: { color: '#FFFFFF' },

  list: { gap: 12 },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    shadowColor: '#5414B8',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  cardTopLeft: { flex: 1, minWidth: 0 },
  orderRef: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  orderWhen: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  productBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    backgroundColor: '#FAF8FD',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1ECF8',
  },
  productIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE7F6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productThumb: {
    width: 38,
    height: 38,
  },
  productIconFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LAVENDER,
  },
  productCopy: { flex: 1, minWidth: 0 },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  productMore: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: PURPLE,
  },
  cardChevron: {
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  metaLeft: { flex: 1, minWidth: 0, gap: 3 },
  metaWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    flex: 1,
  },
  metaQtyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    lineHeight: 15,
    color: PURPLE_DEEP,
  },
  totalCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingLeft: 4,
    maxWidth: '48%',
  },
  totalValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 21,
    color: PURPLE_DEEP,
    textAlign: 'right',
  },
  axisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
  },
  cashNote: {
    marginTop: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: WARN,
  },
  cashEarn: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: OK,
  },
  cashPending: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },

  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 26,
    alignItems: 'center',
    shadowColor: '#5414B8',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  emptyArt: {
    width: 160,
    height: 140,
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 23,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 5,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 260,
  },
  primaryCta: {
    marginTop: 16,
    width: '100%',
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryCtaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
  },

  stateCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
  },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 23,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  stateText: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 280,
  },
  retryBtn: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: '#FFFFFF',
  },

  skeletonList: { gap: 12 },
  skeletonCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },
  skeletonLineWide: {
    width: '42%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EDEAF4',
  },
  skeletonLineMid: {
    width: '58%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F1EEF6',
  },
  skeletonChip: {
    width: 88,
    height: 22,
    borderRadius: 8,
    backgroundColor: LAVENDER,
  },
  skeletonLineLong: {
    width: '78%',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EDEAF4',
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  skeletonLineShort: {
    width: '36%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F1EEF6',
  },
  skeletonLinePrice: {
    width: '28%',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EDEAF4',
  },

  inlineError: {
    marginTop: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: WARN,
    textAlign: 'center',
  },

  pressedSoft: { opacity: 0.92 },
});
