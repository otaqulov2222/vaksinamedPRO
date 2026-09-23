import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
const BG = '#F5F4FA';
const CARD = '#FFFFFF';
const BORDER = '#E8E4F2';
const LAVENDER = '#F6F2FC';
const OK = '#3D7A55';
const BAD = '#B91C1C';
const WARN = '#B45309';

const priceUz = (n: number) =>
  `${Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

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
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function AxisChip({
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
    <View style={[styles.chipAxis, { backgroundColor: palette.bg }]}>
      <Text style={[styles.chipAxisText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function paymentTone(status?: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID') return 'ok';
  if (s === 'PENDING') return 'warn';
  if (s === 'FAILED') return 'bad';
  return 'neutral';
}

function reservationTone(status?: string, expired?: boolean): 'ok' | 'warn' | 'bad' | 'neutral' | 'purple' {
  if (expired) return 'warn';
  const s = String(status || '').toUpperCase();
  if (s === 'FULFILLED') return 'ok';
  if (s === 'ACTIVE') return 'purple';
  if (s === 'EXPIRED') return 'warn';
  if (s === 'CANCELLED') return 'bad';
  return 'neutral';
}

function OrdersEmptyHero() {
  return (
    <Image
      source={require('../../assets/images/orders-empty-premium.png')}
      style={styles.heroArt}
      contentFit="contain"
      cachePolicy="none"
      transition={0}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function OrderCard({
  order,
  expanded,
  onToggleExpand,
}: {
  order: any;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const count = items.reduce((s, it) => s + Number(it.quantity || 1), 0) || items.length;
  const first = items[0];
  const firstTitle = String(first?.title || first?.nameUz || '');
  const more = Math.max(0, items.length - 1);
  const pay = String(order.paymentStatus || '');
  const payShort = paymentLabelShort(order.paymentStatus);
  const resExpired = Boolean(order.reservationExpired);
  const resShort = reservationLabelShort(order.reservationStatus, resExpired);
  const fulfillLabel = fulfillmentLabel(order.fulfillmentStatus);
  const isDelivery = String(order.fulfillment || '').toLowerCase() === 'delivery';
  const usedCb = Number(order.cashbackUsed) || 0;
  const code = String(order.code || '');
  const totalLabel = priceUz(order.total);

  const a11y = [
    'Buyurtmani ko‘rish',
    code ? code : null,
    firstTitle || null,
    totalLabel,
    fulfillLabel,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          const id = Number(order.id);
          if (!Number.isFinite(id) || id <= 0) return;
          router.push(`/order/${id}`);
        }}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={styles.cardMain}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.orderCode} numberOfLines={1}>
              {code ? `#${code}` : 'Buyurtma'}
            </Text>
            <Text style={styles.orderWhen} numberOfLines={1}>
              {formatWhen(order.createdAt)}
            </Text>
          </View>
          <Text style={styles.totalValue} numberOfLines={1}>
            {totalLabel}
          </Text>
        </View>

        <Text style={styles.fulfillPrimary} numberOfLines={1}>
          {fulfillLabel}
        </Text>

        <View style={styles.axisRow}>
          {payShort ? <AxisChip label={payShort} tone={paymentTone(pay)} /> : null}
          {resShort ? (
            <AxisChip
              label={resShort}
              tone={reservationTone(order.reservationStatus, resExpired)}
            />
          ) : null}
        </View>

        <View style={styles.previewBlock}>
          <View style={styles.previewThumb}>
            <MaterialCommunityIcons name="pill" size={22} color={PURPLE} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.productName} numberOfLines={2}>
              {firstTitle || `${count} ta mahsulot`}
            </Text>
            <Text style={styles.productMeta} numberOfLines={1}>
              {count} ta · {isDelivery ? 'Yetkazib berish' : 'Filialdan olib ketish'}
            </Text>
            {order.branch?.name ? (
              <Text style={styles.branchName} numberOfLines={2}>
                {String(order.branch.name)}
              </Text>
            ) : null}
          </View>
        </View>

        {usedCb > 0 ? (
          <Text style={styles.cashbackUsed} numberOfLines={1}>
            Cashback ishlatildi: −{priceUz(usedCb)}
          </Text>
        ) : null}
      </Pressable>

      {/* Sibling actions — not nested inside the main Pressable */}
      <View style={styles.cardActions}>
        <Pressable
          onPress={onToggleExpand}
          style={styles.actionLink}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Yopish' : 'Batafsil ma’lumot'}
          accessibilityState={{ expanded }}
        >
          <Text style={styles.actionLinkText}>{expanded ? 'Yopish' : 'Batafsil'}</Text>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={PURPLE} />
        </Pressable>
        {isCompleted(order) ? (
          <Pressable
            onPress={() => router.push('/(tabs)/catalog')}
            style={styles.actionLink}
            accessibilityRole="button"
            accessibilityLabel="Katalogga o‘tish"
          >
            <Feather name="shopping-bag" size={14} color={PURPLE} />
            <Text style={styles.actionLinkText}>Katalog</Text>
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.expandBox}>
          {items.map((it: any, idx: number) => (
            <View key={String(it.id || idx)} style={styles.expandRow}>
              <Text style={styles.expandTitle} numberOfLines={2}>
                {String(it.title || it.nameUz || 'Mahsulot')} × {Number(it.quantity) || 1}
              </Text>
              <Text style={styles.expandPrice} numberOfLines={1}>
                {priceUz(Number(it.price || 0) * Number(it.quantity || 1))}
              </Text>
            </View>
          ))}
          {more > 0 && !items.length ? (
            <Text style={styles.expandMeta}>+{more} mahsulot</Text>
          ) : null}
          {isDelivery && order.address ? (
            <Text style={styles.expandMeta} numberOfLines={2}>
              Manzil: {String(order.address)}
            </Text>
          ) : null}
          {isDelivery ? (
            <Text style={styles.expandMeta}>
              Yetkazib berish tafsilotlari buyurtma sahifasida.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function PurchasesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < 380;
  const sidePad = narrow ? 14 : 16;

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadGen = useRef(0);
  const loadingRef = useRef(false);
  const ordersRef = useRef<any[]>([]);
  ordersRef.current = orders;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (loadingRef.current && opts?.silent) return;
    const gen = ++loadGen.current;
    loadingRef.current = true;
    const silent = Boolean(opts?.silent && ordersRef.current.length > 0);
    if (!silent) {
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
      if (!silent) setOrders([]);
      setLoadError(e instanceof Error ? e.message : 'Buyurtmalarni yuklashda xatolik yuz berdi.');
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
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
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'progress' && !isProgress(o)) return false;
      if (filter === 'completed' && !isCompleted(o)) return false;
      if (filter === 'cancelled' && !isCancelled(o)) return false;
      if (!q) return true;
      const hay = `${o.code || ''} ${o.branch?.name || ''} ${o.fulfillmentStatus || ''} ${o.paymentStatus || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, filter, query]);

  const countFor = (key: FilterKey) => {
    if (key === 'all') return counts.all;
    if (key === 'progress') return counts.progress;
    if (key === 'completed') return counts.completed;
    return counts.cancelled;
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: sidePad, paddingBottom: 28 + bottomPad },
          orders.length === 0 && !loading && !loadError ? styles.contentEmpty : null,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading && orders.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={PURPLE} />
            <Text style={styles.loadingText}>Yuklanmoqda…</Text>
          </View>
        ) : loadError && orders.length === 0 ? (
          <View style={styles.centerBox}>
            <Feather name="cloud-off" size={36} color={MUTED} />
            <Text style={styles.emptyTitle}>Xatolik</Text>
            <Text style={styles.emptyText}>
              Buyurtmalarni yuklashda xatolik yuz berdi.
            </Text>
            {loadError ? <Text style={[styles.emptyText, { marginTop: 4 }]}>{loadError}</Text> : null}
            <Pressable
              onPress={() => void load()}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Qayta urinish"
            >
              <Feather name="refresh-cw" size={15} color={PURPLE} />
              <Text style={styles.retryText}>Qayta urinish</Text>
            </Pressable>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyHeader}>
              <Text style={styles.emptyPageTitle}>Buyurtmalar</Text>
              <Text style={styles.emptyPageSub}>
                Sizning barcha buyurtmalaringiz shu yerda ko‘rsatiladi
              </Text>
            </View>
            <View style={styles.emptyBody}>
              <OrdersEmptyHero />
              <Text style={styles.emptyMainTitle}>Hozircha buyurtma yo‘q</Text>
              <Text style={styles.emptyMainText}>
                Buyurtma berganingizdan so‘ng, ular shu yerda ko‘rsatiladi.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/catalog')}
                style={styles.emptyCtaPress}
                accessibilityRole="button"
                accessibilityLabel="Mahsulotlar tanlash"
              >
                <LinearGradient
                  colors={['#A855F7', '#5B4BDB']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.emptyCta}
                >
                  <View style={styles.emptyCtaIcon}>
                    <MaterialCommunityIcons name="shopping-outline" size={18} color={PURPLE} />
                  </View>
                  <Text style={styles.emptyCtaText}>Mahsulotlar tanlash</Text>
                  <Feather name="arrow-right" size={18} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>Buyurtmalar</Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  Barcha buyurtmalaringiz shu yerda
                </Text>
              </View>
              <Pressable
                style={styles.searchBtn}
                onPress={() => setSearchOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Qidiruv"
              >
                <Feather name="search" size={18} color={PURPLE_DEEP} />
              </Pressable>
            </View>

            {searchOpen ? (
              <View style={styles.searchBar}>
                <Feather name="search" size={16} color={MUTED} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buyurtma kodini qidirish…"
                  placeholderTextColor="#A8B0C0"
                  style={styles.searchInput}
                  autoFocus
                  accessibilityLabel="Buyurtma qidiruvi"
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Tozalash">
                    <Feather name="x" size={16} color={MUTED} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.filters, { paddingHorizontal: sidePad }]}
              style={[styles.filtersScroll, { marginHorizontal: -sidePad }]}
            >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const n = countFor(f.key);
                return (
                  <Pressable
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setFilter(f.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${f.label}, ${n} ta`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                    <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                      <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>
                        {n}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {visible.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyTitle}>Buyurtmalar topilmadi</Text>
                <Text style={styles.emptyText}>Boshqa filtr yoki qidiruvni sinab ko‘ring</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {visible.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    expanded={expandedId === o.id}
                    onToggleExpand={() =>
                      setExpandedId((cur) => (cur === o.id ? null : Number(o.id)))
                    }
                  />
                ))}
              </View>
            )}
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
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  contentEmpty: {
    justifyContent: 'flex-start',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: PURPLE_DEEP,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: PURPLE_DEEP,
    padding: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },

  filtersScroll: { marginBottom: 14, flexGrow: 0 },
  filters: { gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#64748B' },
  chipTextActive: { color: '#fff' },
  chipBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: PURPLE },
  chipBadgeTextActive: { color: '#fff' },

  list: { gap: 12 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardMain: { padding: 14, paddingBottom: 8 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  orderCode: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  orderWhen: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  totalValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE,
    flexShrink: 0,
    maxWidth: '42%',
    textAlign: 'right',
  },
  fulfillPrimary: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    marginBottom: 8,
  },
  axisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chipAxis: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipAxisText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },

  previewBlock: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  previewThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  productMeta: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  branchName: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  cashbackUsed: {
    marginTop: 10,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: WARN,
  },

  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0ECF7',
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingVertical: 4,
  },
  actionLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },

  expandBox: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  expandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  expandTitle: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  expandPrice: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  expandMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },

  emptyWrap: { flexGrow: 1, backgroundColor: BG },
  emptyHeader: { marginBottom: 8 },
  emptyPageTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: PURPLE_DEEP,
  },
  emptyPageSub: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
  },
  emptyBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 20,
  },
  heroArt: {
    width: '100%',
    maxWidth: 300,
    aspectRatio: 1770 / 1577,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  emptyMainTitle: {
    marginTop: 10,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  emptyMainText: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 320,
  },
  emptyCtaPress: { marginTop: 28, width: '100%', maxWidth: 340 },
  emptyCta: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  emptyCtaIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    flexShrink: 1,
  },

  centerBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 300,
  },
  retryBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: LAVENDER,
    borderRadius: 14,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
});
