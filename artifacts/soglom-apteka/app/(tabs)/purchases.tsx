import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import {
  fulfillmentProgressStep,
  isFulfillmentCancelled,
  isFulfillmentDelivered,
  fulfillmentLabel,
  paymentLabel,
} from '@/lib/orderLabels';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#FFFFFF';
const CARD = '#FFFFFF';

const priceUz = (n: number) =>
  `${Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')} so'm`;

type FilterKey = 'all' | 'progress' | 'delivered' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Barchasi' },
  { key: 'progress', label: 'Jarayonda' },
  { key: 'delivered', label: 'Yetkazilgan' },
  { key: 'cancelled', label: 'Bekor qilingan' },
];

function isDelivered(order: any) {
  return isFulfillmentDelivered(order.fulfillmentStatus, order.status);
}
function isCancelled(order: any) {
  return isFulfillmentCancelled(order.fulfillmentStatus, order.status);
}
function isProgress(order: any) {
  return !isDelivered(order) && !isCancelled(order);
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

function progressStep(order: any) {
  if (order.fulfillmentStatus) return fulfillmentProgressStep(order.fulfillmentStatus);
  const s = String(order.status || '').toLowerCase();
  if (isDelivered(order) || s.includes('completed')) return 3;
  if (s.includes('awaiting_delivery') || s.includes('delivering') || s.includes('shipping')) return 2;
  if (s.includes('prepar') || s.includes('pack') || s.includes('ready') || s.includes('processing')) return 1;
  return 0;
}

/** Oddiy illustratsiya — animatsiya/fon yo‘q, faqat oq ekranga mos */
function OrdersEmptyHero() {
  return (
    <Image
      source={require('../../assets/images/orders-empty-premium.png')}
      style={styles.heroArt}
      contentFit="contain"
      cachePolicy="none"
      transition={0}
      accessibilityLabel="Buyurtmalar"
    />
  );
}

function StatusBadge({ order }: { order: any }) {
  if (isDelivered(order)) {
    return (
      <View style={[styles.badge, styles.badgeDone]}>
        <MaterialCommunityIcons name="truck-delivery-outline" size={14} color="#15803D" />
        <Text style={[styles.badgeText, { color: '#15803D' }]}>Yakunlangan</Text>
        <Feather name="chevron-right" size={14} color="#15803D" />
      </View>
    );
  }
  if (isCancelled(order)) {
    return (
      <View style={[styles.badge, styles.badgeCancel]}>
        <MaterialCommunityIcons name="close-circle-outline" size={14} color="#B91C1C" />
        <Text style={[styles.badgeText, { color: '#B91C1C' }]}>Bekor qilingan</Text>
      </View>
    );
  }
  if (String(order.paymentStatus || '').toUpperCase() === 'PENDING') {
    return (
      <View style={[styles.badge, styles.badgeProgress]}>
        <MaterialCommunityIcons name="cash" size={14} color="#B45309" />
        <Text style={[styles.badgeText, { color: '#B45309' }]}>To‘lov kutilmoqda</Text>
        <Feather name="chevron-right" size={14} color="#B45309" />
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeProgress]}>
      <MaterialCommunityIcons name="clock-outline" size={14} color="#B45309" />
      <Text style={[styles.badgeText, { color: '#B45309' }]}>Jarayonda</Text>
      <Feather name="chevron-right" size={14} color="#B45309" />
    </View>
  );
}

function ProgressTrack({ order }: { order: any }) {
  const step = progressStep(order);
  const pickup = String(order.fulfillment || '').toLowerCase() === 'pickup';
  const labels: Array<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string }> = [
    { icon: 'shopping-outline', title: 'Buyurtma yaratildi' },
    { icon: 'package-variant', title: 'Tayyorlanmoqda' },
    {
      icon: pickup ? 'storefront-outline' : 'truck-delivery-outline',
      title: pickup ? 'Olishga tayyor' : 'Yetkazib berilmoqda',
    },
    { icon: 'check-circle-outline', title: 'Yakunlandi' },
  ];
  return (
    <View style={styles.track}>
      {labels.map((l, i) => {
        const on = i <= step;
        return (
          <React.Fragment key={l.title}>
            {i > 0 ? <View style={[styles.trackLine, i <= step ? styles.trackLineOn : null]} /> : null}
            <View style={styles.trackStep}>
              <View style={[styles.trackDot, on && styles.trackDotOn]}>
                <MaterialCommunityIcons name={l.icon} size={14} color={on ? '#fff' : '#C4B5D8'} />
              </View>
              <Text style={[styles.trackLabel, on && styles.trackLabelOn]} numberOfLines={2}>
                {l.title}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const items: any[] = order.items || [];
  const count = items.reduce((s, it) => s + Number(it.quantity || 1), 0) || items.length;
  const preview = items.slice(0, 3);
  const more = Math.max(0, items.length - 3);
  const done = isDelivered(order);

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/order/${order.id}`)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.orderCode} numberOfLines={1}>
            #{order.code || `VM-${order.id}`}
          </Text>
          <Text style={styles.orderWhen}>{formatWhen(order.createdAt)}</Text>
          <Text style={[styles.orderWhen, { marginTop: 2 }]} numberOfLines={1}>
            {fulfillmentLabel(order.fulfillmentStatus)} · {paymentLabel(order.paymentStatus)}
          </Text>
        </View>
        <StatusBadge order={order} />
      </View>

      {isProgress(order) ? <ProgressTrack order={order} /> : null}

      <View style={styles.previewRow}>
        {preview.map((it, idx) => (
          <View key={String(it.id || idx)} style={styles.previewThumb}>
            <MaterialCommunityIcons name="pill" size={22} color={PURPLE} />
          </View>
        ))}
        {more > 0 ? (
          <View style={[styles.previewThumb, styles.previewMore]}>
            <Text style={styles.previewMoreText}>+{more} mahsulot</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardMid}>
        <View style={styles.midLeft}>
          <MaterialCommunityIcons name="shopping-outline" size={16} color={PURPLE} />
          <Text style={styles.midCount}>{count} ta mahsulot</Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onToggle();
            }}
            hitSlop={8}
            style={styles.detailLink}
          >
            <Text style={styles.detailLinkText}>Batafsil ma'lumot</Text>
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={PURPLE} />
          </Pressable>
        </View>
        <View style={styles.midRight}>
          <Text style={styles.totalLabel}>Jami summa</Text>
          <Text style={styles.totalValue}>{priceUz(order.total)}</Text>
        </View>
      </View>

      {expanded ? (
        <View style={styles.expandBox}>
          {items.map((it: any, idx: number) => (
            <View key={String(it.id || idx)} style={styles.expandRow}>
              <Text style={styles.expandTitle} numberOfLines={1}>
                {it.title || it.nameUz || 'Mahsulot'} × {it.quantity || 1}
              </Text>
              <Text style={styles.expandPrice}>{priceUz(Number(it.price || 0) * Number(it.quantity || 1))}</Text>
            </View>
          ))}
          {order.branch?.name ? <Text style={styles.expandMeta}>Filial: {order.branch.name}</Text> : null}
        </View>
      ) : null}

      {done ? (
        <Pressable
          style={styles.reorderBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            router.push('/(tabs)/catalog');
          }}
        >
          <Feather name="shopping-bag" size={15} color={PURPLE} />
          <Text style={styles.reorderText}>Katalogga o‘tish</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function PurchasesScreen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await api.orders();
      setOrders(data.orders || []);
    } catch (e) {
      setOrders([]);
      setLoadError(e instanceof Error ? e.message : 'Buyurtmalar yuklanmadi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const all = orders.length;
    const progress = orders.filter((o) => isProgress(o)).length;
    const delivered = orders.filter((o) => isDelivered(o)).length;
    const cancelled = orders.filter((o) => isCancelled(o)).length;
    return { all, progress, delivered, cancelled };
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'progress' && !isProgress(o)) return false;
      if (filter === 'delivered' && !isDelivered(o)) return false;
      if (filter === 'cancelled' && !isCancelled(o)) return false;
      if (!q) return true;
      const hay = `${o.code || ''} ${o.branch?.name || ''} ${o.status || ''} ${o.fulfillmentStatus || ''} ${o.paymentStatus || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, filter, query]);

  const countFor = (key: FilterKey) => {
    if (key === 'all') return counts.all;
    if (key === 'progress') return counts.progress;
    if (key === 'delivered') return counts.delivered;
    return counts.cancelled;
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          orders.length === 0 && !loading ? styles.contentEmpty : null,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={PURPLE} />
            <Text style={styles.loadingText}>Yuklanmoqda...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyTitle}>Xatolik</Text>
            <Text style={styles.emptyText}>{loadError}</Text>
            <Pressable onPress={() => void load()} style={[styles.reorderBtn, { marginTop: 16, width: '100%', maxWidth: 280 }]}>
              <Feather name="refresh-cw" size={15} color={PURPLE} />
              <Text style={styles.reorderText}>Qayta urinish</Text>
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
              <Pressable style={styles.searchBtn} onPress={() => setSearchOpen((v) => !v)} accessibilityLabel="Qidiruv">
                <Feather name="search" size={18} color={PURPLE_DEEP} />
              </Pressable>
            </View>

            {searchOpen ? (
              <View style={styles.searchBar}>
                <Feather name="search" size={16} color={MUTED} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buyurtma kodini qidirish..."
                  placeholderTextColor="#A8B0C0"
                  style={styles.searchInput}
                  autoFocus
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Feather name="x" size={16} color={MUTED} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              style={styles.filtersScroll}
            >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const n = countFor(f.key);
                return (
                  <Pressable
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                    <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                      <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>{n}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {visible.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyTitle}>Natija topilmadi</Text>
                <Text style={styles.emptyText}>Boshqa filtr yoki qidiruvni sinab ko‘ring</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {visible.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    expanded={expandedId === o.id}
                    onToggle={() => setExpandedId((cur) => (cur === o.id ? null : o.id))}
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
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },

  contentEmpty: {
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    flexGrow: 1,
  },
  emptyWrap: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
  },
  emptyHeader: {
    marginBottom: 8,
  },
  emptyPageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: PURPLE_DEEP,
    letterSpacing: -0.3,
  },
  emptyPageSub: {
    marginTop: 6,
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
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  emptyMainTitle: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '800',
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  emptyMainText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 320,
  },
  emptyCtaPress: {
    marginTop: 28,
    width: '100%',
    maxWidth: 340,
  },
  emptyCta: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  emptyCtaIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
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
    includeFontPadding: false,
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
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: PURPLE_DEEP,
    padding: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },

  filtersScroll: { marginBottom: 14, marginHorizontal: -16, flexGrow: 0 },
  filters: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E1F0',
  },
  chipActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  chipTextActive: { color: '#fff' },
  chipBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: PURPLE,
  },
  chipBadgeTextActive: { color: '#fff' },

  list: { gap: 12 },

  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 14,
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  orderCode: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  orderWhen: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeDone: { backgroundColor: '#DCFCE7' },
  badgeProgress: { backgroundColor: '#FEF3C7' },
  badgeCancel: { backgroundColor: '#FEE2E2' },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },

  track: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  trackStep: { width: 64, alignItems: 'center' },
  trackDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EDE8F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  trackDotOn: { backgroundColor: PURPLE },
  trackLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#E5E1F0',
    marginTop: 12,
    marginHorizontal: -4,
    borderRadius: 2,
  },
  trackLineOn: { backgroundColor: PURPLE },
  trackLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    lineHeight: 11,
    color: MUTED,
    textAlign: 'center',
  },
  trackLabelOn: {
    fontFamily: 'Inter_500Medium',
    color: PURPLE_DEEP,
  },

  previewRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  previewThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FAFAFC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImg: { width: '80%', height: '80%' },
  previewMore: {
    backgroundColor: '#EDE5FF',
    paddingHorizontal: 6,
  },
  previewMoreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: PURPLE,
    textAlign: 'center',
  },

  cardMid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  midLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  midCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: PURPLE_DEEP,
  },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailLinkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: PURPLE,
  },
  midRight: { alignItems: 'flex-end' },
  totalLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  totalValue: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE,
    includeFontPadding: false,
  },

  expandBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0ECF7',
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
    fontSize: 12,
    color: PURPLE_DEEP,
  },
  expandPrice: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },
  expandMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },

  reorderBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0E9FF',
    borderRadius: 14,
    minHeight: 44,
  },
  reorderText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },

  empty: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: PURPLE_DEEP,
    textAlign: 'center',
    includeFontPadding: false,
  },
  emptyText: {
    marginTop: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 300,
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
});
