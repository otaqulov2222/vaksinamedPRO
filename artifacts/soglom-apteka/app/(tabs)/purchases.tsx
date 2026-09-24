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
import { formatUzs } from '@/components/AppUI';
import { api } from '@/lib/api';
import {
  isFulfillmentCancelled,
  isFulfillmentDelivered,
  fulfillmentLabel,
  paymentLabelShort,
  reservationLabelShort,
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

type FilterKey = 'all' | 'progress' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Barchasi' },
  { key: 'progress', label: 'Jarayonda' },
  { key: 'completed', label: 'Yakunlangan' },
  { key: 'cancelled', label: 'Bekor qilingan' },
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

function formatWhen(raw?: string) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const months = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr',
  ];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const year = d.getFullYear();
  const dayMonth = `${d.getDate()} ${months[d.getMonth()]}`;
  if (year !== new Date().getFullYear()) {
    return `${dayMonth} ${year} · ${hh}:${mm}`;
  }
  return `${dayMonth} · ${hh}:${mm}`;
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

function reservationTone(status?: string, expired?: boolean): 'ok' | 'warn' | 'bad' | 'purple' | 'neutral' {
  if (expired) return 'warn';
  const s = String(status || '').toUpperCase();
  if (s === 'FULFILLED') return 'ok';
  if (s === 'ACTIVE') return 'purple';
  if (s === 'EXPIRED') return 'warn';
  if (s === 'CANCELLED') return 'bad';
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
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.length;
  const qtyTotal =
    items.reduce((s, it) => s + Math.max(1, Number(it.quantity) || 1), 0) || itemCount;
  const first = items[0];
  const firstTitle = String(first?.title || first?.nameUz || '').trim();
  const moreItems = Math.max(0, itemCount - 1);

  const pay = String(order.paymentStatus || '');
  const fulfill = String(order.fulfillmentStatus || '');
  const payShort = paymentLabelShort(order.paymentStatus);
  const fulfillText = fulfillmentLabel(order.fulfillmentStatus);
  const resExpired = Boolean(order.reservationExpired);
  const resShort = reservationLabelShort(order.reservationStatus, resExpired);

  const isDelivery = String(order.fulfillment || '').toLowerCase() === 'delivery';
  const methodLabel = isDelivery ? 'Yetkazib berish' : 'Filialdan olib ketish';
  const branchName = order.branch?.name ? String(order.branch.name) : '';
  const usedCb = Number(order.cashbackUsed) || 0;
  const earnedCb = Number(order.cashbackEarned) || 0;
  const completed = isCompleted(order);
  const code = String(order.code || '').trim();
  const totalLabel = formatUzs(Math.max(0, Math.floor(Number(order.total) || 0)));
  const when = formatWhen(order.createdAt);

  const productLine = firstTitle
    ? firstTitle
    : qtyTotal > 0
      ? `${qtyTotal} ta mahsulot`
      : 'Mahsulotlar';
  const moreLine = moreItems > 0 ? `+ yana ${moreItems} ta mahsulot` : null;

  const placeLine = [branchName, methodLabel].filter(Boolean).join(' · ');

  const a11y = [
    code ? `Buyurtma #${code}` : 'Buyurtma',
    fulfillText,
    `jami ${totalLabel}`,
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
            {code ? `Buyurtma #${code}` : 'Buyurtma'}
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
        <View style={styles.productIcon} importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name="pill" size={18} color={PURPLE} />
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
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          {placeLine ? (
            <Text style={styles.metaText} numberOfLines={2}>
              {placeLine}
            </Text>
          ) : null}
          {qtyTotal > 0 ? (
            <Text style={styles.metaText} numberOfLines={1}>
              {qtyTotal} ta mahsulot
            </Text>
          ) : null}
        </View>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {totalLabel}
        </Text>
      </View>

      <View style={styles.axisRow}>
        {payShort ? <StatusChip label={payShort} tone={paymentTone(pay)} /> : null}
        {resShort ? (
          <StatusChip label={resShort} tone={reservationTone(order.reservationStatus, resExpired)} />
        ) : null}
      </View>

      {usedCb > 0 ? (
        <Text style={styles.cashNote} numberOfLines={1}>
          Cashback ishlatildi: −{formatUzs(usedCb)}
        </Text>
      ) : null}
      {completed && earnedCb > 0 ? (
        <Text style={styles.cashEarn} numberOfLines={1}>
          Cashback olindi: +{formatUzs(earnedCb)}
        </Text>
      ) : earnedCb > 0 && !completed ? (
        <Text style={styles.cashPending} numberOfLines={1}>
          Cashback buyurtma yakunlangach hisoblanadi
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function PurchasesScreen() {
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
      setLoadError(e instanceof Error ? e.message : 'Buyurtmalarni yuklashda xatolik yuz berdi.');
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
        loadingRef.current = false;
      }
    }
  }, []);

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

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const tabClearance = Platform.OS === 'web' ? 96 : 80;
  const bottomPad = 28 + Math.max(insets.bottom, 8) + tabClearance;

  const showInitialLoad = loading && orders.length === 0 && !loadError;
  const showError = Boolean(loadError) && orders.length === 0 && !loading;
  const showEmpty = !loading && !loadError && orders.length === 0;
  const showList = orders.length > 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.pageTitle}>Buyurtmalar</Text>
        <Text style={styles.pageSubtitle}>
          Buyurtmalaringiz va ularning holati shu yerda
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
        showsVerticalScrollIndicator={false}
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
              <Text style={styles.stateTitle}>Buyurtmalarni yuklab bo‘lmadi</Text>
              <Text style={styles.stateText}>
                Internetni tekshirib, qayta urinib ko‘ring.
              </Text>
              <Pressable
                onPress={() => void load()}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressedSoft]}
                accessibilityRole="button"
                accessibilityLabel="Qayta urinish"
              >
                <Feather name="refresh-cw" size={15} color="#FFFFFF" />
                <Text style={styles.retryText}>Qayta urinish</Text>
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
              <Text style={styles.emptyTitle}>Buyurtmalar hali yo‘q</Text>
              <Text style={styles.emptyText}>
                Mahsulot tanlab, birinchi buyurtmangizni rasmiylashtiring.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/catalog')}
                style={({ pressed }) => [styles.primaryCta, pressed && styles.pressedSoft]}
                accessibilityRole="button"
                accessibilityLabel="Mahsulot tanlash"
              >
                <MaterialCommunityIcons name="shopping-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryCtaText}>Mahsulot tanlash</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {header}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.filters, { paddingRight: 4 }]}
              style={[styles.filtersScroll, { marginHorizontal: -sidePad, paddingHorizontal: sidePad }]}
            >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const n = countFor(f.key);
                return (
                  <Pressable
                    key={f.key}
                    style={[styles.filterChip, active && styles.filterChipOn]}
                    onPress={() => setFilter(f.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${f.label}, ${n} ta`}
                  >
                    <Text style={[styles.filterLabel, active && styles.filterLabelOn]}>{f.label}</Text>
                    <View style={[styles.filterBadge, active && styles.filterBadgeOn]}>
                      <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextOn]}>
                        {n}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {visible.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Buyurtmalar topilmadi</Text>
                <Text style={styles.stateText}>Boshqa filtrni tanlab ko‘ring.</Text>
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
                Yangilashda xatolik. Pastga tortib qayta urinib ko‘ring.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
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

  filtersScroll: {
    marginBottom: 14,
    flexGrow: 0,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  cardTopLeft: { flex: 1, minWidth: 0 },
  orderRef: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
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
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  productIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productCopy: { flex: 1, minWidth: 0 },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  productMore: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 10,
  },
  metaLeft: { flex: 1, minWidth: 0, gap: 2 },
  metaText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  totalValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 21,
    color: PURPLE_DEEP,
    flexShrink: 0,
    maxWidth: '46%',
    textAlign: 'right',
  },
  axisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    alignItems: 'center',
  },
  emptyArt: {
    width: 118,
    height: 105,
    marginBottom: 10,
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
    marginTop: 14,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    maxWidth: 300,
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
