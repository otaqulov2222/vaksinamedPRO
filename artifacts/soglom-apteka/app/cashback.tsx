import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { formatUzs } from '@/components/AppUI';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const GOLD = '#C9A227';
const GREEN = '#16A34A';
const USE_AMBER = '#D97706';
const VOID_SLATE = '#475569';

const TIER_ICONS: Record<string, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string; iconBg: string }> = {
  silver: { icon: 'medal-outline', color: '#7C3AED', iconBg: '#EDE9FE' },
  gold: { icon: 'star-circle', color: GOLD, iconBg: '#FFF4CC' },
  platinum: { icon: 'diamond', color: '#7C3AED', iconBg: '#EDE9FE' },
  default: { icon: 'crown-outline', color: '#7C3AED', iconBg: '#EDE9FE' },
};

type LedgerKind = 'earn' | 'use' | 'void';

/** Map API loyalty_ledger.kind — never treat void as earn. */
function ledgerKindOf(raw?: string): LedgerKind {
  const k = String(raw || '').toLowerCase();
  if (k === 'use') return 'use';
  if (k === 'void') return 'void';
  return 'earn';
}

/**
 * Display-only mapping from server kind + signed cashback field.
 * Does not recalculate balance; preserves server amount magnitude.
 */
function ledgerPresentation(item: { kind?: string; title?: string; cashback?: number }) {
  const kind = ledgerKindOf(item.kind);
  const raw = Number(item.cashback);
  const amount = Number.isFinite(raw) ? raw : 0;
  const abs = Math.abs(amount);
  const title =
    String(item.title || '').trim() ||
    (kind === 'use'
      ? 'Cashback ishlatildi'
      : kind === 'void'
        ? 'Cashback bekor qilindi'
        : 'Cashback tushdi');

  if (kind === 'earn') {
    return {
      kind,
      title,
      abs,
      prefix: '+' as const,
      color: GREEN,
      iconBg: '#F3E8FF',
      icon: 'shopping-outline' as const,
      a11yVerb: 'Cashback tushdi',
    };
  }
  if (kind === 'use') {
    return {
      kind,
      title,
      abs,
      prefix: '−' as const,
      color: USE_AMBER,
      iconBg: '#FFF7ED',
      icon: 'credit-card-outline' as const,
      a11yVerb: 'Cashback ishlatildi',
    };
  }
  // void: POS cheque cancelled — signed net effect from server (used − earned).
  // Never style as a normal positive earn credit.
  const prefix = amount > 0 ? ('+' as const) : amount < 0 ? ('−' as const) : ('' as const);
  return {
    kind,
    title,
    abs,
    prefix,
    color: VOID_SLATE,
    iconBg: '#F1F5F9',
    icon: 'close-circle-outline' as const,
    a11yVerb: 'Cashback bekor qilindi',
  };
}

function tierKeyOf(tier?: string) {
  const t = String(tier || '').toLowerCase();
  if (t.includes('plat')) return 'platinum';
  if (t.includes('gold') || t.includes('oltin')) return 'gold';
  if (t.includes('silver') || t.includes('kumush')) return 'silver';
  return 'default';
}

function formatWhen(raw?: string) {
  if (!raw) return '';
  if (!/^\d{4}-\d{2}/.test(raw) && raw.length > 6) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const months = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CashbackScreen() {
  const insets = useSafeAreaInsets();
  const { balance, transactions, user, refresh } = useApp();
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusTier = String(params.focus || '').toLowerCase() === 'tier';
  const [rules, setRules] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const tierY = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void refresh();
      void api
        .cashbackRules()
        .then((next) => {
          if (alive) setRules(next);
        })
        .catch(() => {
          if (alive) setRules(null);
        });
      return () => {
        alive = false;
      };
    }, [refresh]),
  );

  useEffect(() => {
    if (!focusTier) return;
    const t = setTimeout(() => {
      if (tierY.current > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, tierY.current - 12), animated: true });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [focusTier, rules]);

  const tierKey = tierKeyOf(user?.tier);
  const currentTierLabel = String(user?.tier || '').trim() || 'Daraja mavjud emas';

  // Match Home: next tier from API rules relative to current tier — never invent thresholds.
  const nextFromRules = useMemo(() => {
    const tiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    if (!tiers.length) return null;
    const threshold = (t: any) => Number(t?.fromTotal ?? t?.minSpend);
    const gold = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes('gold'));
    const plat = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes('plat'));
    const userTier = String(user?.tier || '').toLowerCase();
    if (userTier.includes('plat')) return null;
    if (userTier.includes('gold') && Number.isFinite(threshold(plat))) {
      return { label: String(plat.tier || '').trim() || '—', target: threshold(plat) };
    }
    if (Number.isFinite(threshold(gold))) {
      return { label: String(gold.tier || '').trim() || '—', target: threshold(gold) };
    }
    if (Number.isFinite(threshold(plat))) {
      return { label: String(plat.tier || '').trim() || '—', target: threshold(plat) };
    }
    return null;
  }, [rules, user?.tier]);

  const next = nextFromRules;
  const spent = Number(user?.total || 0);
  const left = next != null ? Math.max(0, next.target - spent) : null;
  const progress =
    next != null ? Math.min(1, Math.max(0, spent / Math.max(1, next.target))) : null;

  type TierCard = {
    key: string;
    matchKey: string;
    label: string;
    rate: string | null;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    color: string;
    iconBg: string;
  };

  const tiers: TierCard[] = useMemo(() => {
    const apiTiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    if (apiTiers.length) {
      return apiTiers.map((t: any, idx: number): TierCard => {
        const label = String(t.tier || '').trim() || '—';
        const key = tierKeyOf(label);
        const meta = TIER_ICONS[key] || TIER_ICONS.default;
        const rate = t?.rate != null ? String(t.rate).trim() : '';
        return {
          key: `${key}-${idx}`,
          matchKey: key,
          label,
          rate: rate || null,
          icon: meta.icon,
          color: meta.color,
          iconBg: meta.iconBg,
        };
      });
    }
    // No rules yet — show current tier only, no invented thresholds/rates.
    const meta = TIER_ICONS[tierKey] || TIER_ICONS.default;
    return [
      {
        key: 'current',
        matchKey: tierKey,
        label: currentTierLabel,
        rate: null,
        icon: meta.icon,
        color: meta.color,
        iconBg: meta.iconBg,
      },
    ];
  }, [rules, tierKey, currentTierLabel]);

  const list = showAll ? transactions : transactions.slice(0, 4);
  const balanceText = formatUzs(Math.max(0, Math.floor(Number(balance) || 0)));
  const atTop =
    Array.isArray(rules?.tiers) &&
    rules.tiers.length > 0 &&
    next == null &&
    Number.isFinite(spent) &&
    Boolean(String(user?.tier || '').trim());

  const goBack = () => {
    // Stack-aware: Profile/Help/Home → Cashback → Back returns to that parent.
    // Direct open / no history → Profile (not Home).
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + Math.max(insets.bottom, 8) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <Pressable
            onPress={goBack}
            style={styles.navBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Orqaga"
          >
            <Feather name="arrow-left" size={20} color={PURPLE_DEEP} />
          </Pressable>
          <Text style={styles.navTitle}>Cashback</Text>
          <Pressable
            onPress={() => router.push('/qr')}
            style={styles.navBtn}
            accessibilityRole="button"
            accessibilityLabel="Mening QR kodim"
          >
            <MaterialCommunityIcons name="qrcode" size={20} color={PURPLE} />
          </Pressable>
        </View>

        <Text style={styles.title}>Cashback</Text>
        <Text style={styles.subtitle}>Mavjud balans va daraja</Text>

        <LinearGradient
          colors={['#5C2AD6', '#4520B0', '#32168A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <Text
              style={styles.cardLabel}
              accessibilityRole="text"
              accessibilityLabel={`Mavjud cashback balansi, ${balanceText}`}
            >
              Mavjud balans
            </Text>
            <Pressable
              style={styles.useBtn}
              onPress={() => router.push('/(tabs)/catalog')}
              accessibilityRole="button"
              accessibilityLabel="Cashbackni to‘lovda ishlatish"
            >
              <MaterialCommunityIcons
                name="credit-card-outline"
                size={13}
                color="#fff"
                importantForAccessibility="no"
              />
              <Text style={styles.useBtnText}>To‘lovda ishlatish</Text>
              <Feather name="chevron-right" size={13} color="#fff" importantForAccessibility="no" />
            </Pressable>
          </View>

          <View style={styles.cardMid}>
            <Text
              style={styles.amount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              accessible={false}
            >
              {balanceText}
            </Text>
            <View style={styles.artWrap} pointerEvents="none" importantForAccessibility="no-hide-descendants">
              <MaterialCommunityIcons name="wallet" size={52} color="rgba(255,255,255,0.22)" />
              <View style={styles.coinA}>
                <MaterialCommunityIcons name="cached" size={16} color="#fff" />
              </View>
              <View style={styles.coinB} />
              <View style={styles.coinC} />
            </View>
          </View>

          {progress != null ? (
            <View
              style={styles.barBg}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={
                next != null && left != null
                  ? `${next.label} darajagacha progress`
                  : 'Daraja progressi'
              }
              accessibilityValue={{ min: 0, max: 100, now: Math.round((progress || 0) * 100) }}
            >
              <View style={[styles.barFg, { width: `${progress * 100}%` as any }]} />
            </View>
          ) : null}
          <Text style={styles.barHint}>
            {atTop
              ? 'Siz eng yuqori darajadasiz'
              : next != null && left != null
                ? `${next.label} darajagacha yana ${formatUzs(left)} (xaridlar)`
                : 'Keyingi daraja chegarasi serverdan'}
          </Text>
        </LinearGradient>

        <View
          style={styles.tierRow}
          onLayout={(e) => {
            tierY.current = e.nativeEvent.layout.y;
          }}
          accessibilityLabel={focusTier ? 'Daraja tafsilotlari' : undefined}
        >
          {tiers.map((t) => {
            const on = t.matchKey === tierKey || t.label === currentTierLabel;
            const darajaLabel =
              t.matchKey === 'silver'
                ? 'Daraja: Silver'
                : t.matchKey === 'gold'
                  ? 'Gold darajasi'
                  : t.matchKey === 'platinum'
                    ? 'Platinum darajasi'
                    : `Daraja: ${t.label}`;
            return (
              <View
                key={t.key}
                style={[styles.tier, on && styles.tierOn, tiers.length === 1 && styles.tierSingle]}
                accessible
                accessibilityLabel={`${darajaLabel}${t.rate ? `, ${t.rate}` : ''}${on ? ', joriy' : ''}`}
              >
                <View
                  style={[styles.tierIcon, { backgroundColor: t.iconBg }]}
                  importantForAccessibility="no-hide-descendants"
                >
                  <MaterialCommunityIcons name={t.icon} size={20} color={t.color} />
                </View>
                <Text style={styles.tierName} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={[styles.tierRate, on && { color: GOLD }]}>{t.rate ?? '—'}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.info} accessible accessibilityRole="text">
          <View style={styles.infoPct} importantForAccessibility="no-hide-descendants">
            <Text style={styles.infoPctText}>%</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>
              Cashback yakunlangan xaridlardan balansingizga tushadi.
            </Text>
            <Text style={styles.infoSub}>
              Ilova buyurtmalari va dorixona kassasidagi yakunlangan xaridlardan hisoblanadi. Balans
              serverdagi cashback hisobidan olinadi.
            </Text>
          </View>
        </View>

        <View style={styles.secHead}>
          <Text
            style={styles.secTitle}
            accessibilityRole="header"
            accessibilityLabel="Cashback tarixi"
          >
            So‘nggi cashbacklar
          </Text>
          <Pressable
            style={styles.seeAll}
            onPress={() =>
              transactions.length ? setShowAll((v) => !v) : router.push('/(tabs)/catalog')
            }
            accessibilityRole="button"
            accessibilityLabel={
              transactions.length
                ? showAll
                  ? 'Tarixni yopish'
                  : 'Barcha cashbacklarni ko‘rish'
                : 'Buyurtma berish'
            }
          >
            <Text style={styles.seeAllText}>
              {transactions.length ? (showAll ? 'Yopish' : 'Barchasini ko‘rish') : 'Buyurtma berish'}
            </Text>
            <Feather name="chevron-right" size={14} color={PURPLE} importantForAccessibility="no" />
          </Pressable>
        </View>

        {list.length === 0 ? (
          <View style={styles.empty} accessible accessibilityRole="text">
            <View style={styles.emptyIcon} importantForAccessibility="no-hide-descendants">
              <MaterialCommunityIcons name="shopping-outline" size={26} color="#A78BFA" />
            </View>
            <Text style={styles.emptyTitle}>Hali cashback yo‘q</Text>
            <Text style={styles.emptyText}>
              Yakunlangan xaridlar cashbacki shu yerda ko‘rinadi. Namuna yozuvlar yo‘q.
            </Text>
          </View>
        ) : (
          list.map((item) => {
            const row = ledgerPresentation(item);
            const amt = formatUzs(row.abs);
            const signed = row.prefix ? `${row.prefix}${amt}` : amt;
            return (
              <Pressable
                key={item.id}
                style={styles.tx}
                onPress={() => router.push('/(tabs)/purchases')}
                accessibilityRole="button"
                accessibilityLabel={`${row.a11yVerb}, ${row.title}, ${signed}`}
              >
                <View
                  style={[styles.txIcon, { backgroundColor: row.iconBg }]}
                  importantForAccessibility="no-hide-descendants"
                >
                  <MaterialCommunityIcons name={row.icon} size={20} color={row.color} />
                </View>
                <View style={styles.txMid}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    {row.kind === 'void'
                      ? `Bekor qilindi · ${formatWhen(item.date)}`
                      : row.kind === 'use'
                        ? `Ishlatildi · ${formatWhen(item.date)}`
                        : formatWhen(item.date)}
                  </Text>
                </View>
                <Text style={[styles.txAmt, { color: row.color }]} numberOfLines={1}>
                  {signed}
                </Text>
                <Feather name="chevron-right" size={16} color="#C5CAD6" importantForAccessibility="no" />
              </Pressable>
            );
          })
        )}

        <Pressable
          style={styles.promo}
          onPress={() => router.push('/(tabs)/catalog')}
          accessibilityRole="button"
          accessibilityLabel="Katalogga o‘tish"
        >
          <View style={styles.promoGift} importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="gift" size={28} color={PURPLE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.promoKicker}>KATALOG</Text>
            <Text style={styles.promoTitle}>Mahsulotlarni ko‘rish va buyurtma berish</Text>
          </View>
          <View style={styles.promoArrow} importantForAccessibility="no-hide-descendants">
            <Feather name="arrow-right" size={18} color={PURPLE} />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: PURPLE_DEEP },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: PURPLE_DEEP,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    color: MUTED,
  },

  card: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  useBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  cardMid: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
  },
  amount: {
    flex: 1,
    minWidth: 0,
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  artWrap: {
    width: 88,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinA: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(167,139,250,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinB: {
    position: 'absolute',
    left: 2,
    top: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,204,0,0.55)',
  },
  coinC: {
    position: 'absolute',
    right: 28,
    top: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  barBg: {
    marginTop: 16,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  barFg: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#C4B5FD',
  },
  barHint: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 17,
  },

  tierRow: { flexDirection: 'row', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  tier: {
    flex: 1,
    minWidth: 96,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#EEF0F6',
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 5,
  },
  tierSingle: {
    flexGrow: 0,
    flexBasis: '48%',
    maxWidth: 180,
  },
  tierOn: {
    borderColor: '#F0D78C',
    backgroundColor: '#FFFCF0',
  },
  tierIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierName: { fontSize: 13, fontWeight: '700', color: PURPLE_DEEP },
  tierRate: { fontSize: 15, fontWeight: '800', color: PURPLE },

  info: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F3ECFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  infoPct: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoPctText: { fontSize: 15, fontWeight: '800', color: PURPLE },
  infoTitle: { fontSize: 13, fontWeight: '700', color: PURPLE_DEEP, lineHeight: 18 },
  infoSub: { marginTop: 4, fontSize: 12, color: MUTED, lineHeight: 17 },

  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  secTitle: { fontSize: 16, fontWeight: '800', color: PURPLE_DEEP, flexShrink: 1 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 12, fontWeight: '700', color: PURPLE },

  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: '#FAFAFE',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEF0F6',
    marginBottom: 14,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: PURPLE_DEEP },
  emptyText: { marginTop: 4, fontSize: 12, color: MUTED, textAlign: 'center', paddingHorizontal: 20 },

  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF0F6',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  txIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMid: { flex: 1, minWidth: 0 },
  txTitle: { fontSize: 14, fontWeight: '700', color: PURPLE_DEEP },
  txMeta: { marginTop: 2, fontSize: 11, color: MUTED },
  txAmt: { fontSize: 13, fontWeight: '800', flexShrink: 0, maxWidth: '42%', textAlign: 'right' },

  promo: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0E9FF',
    borderRadius: 18,
    padding: 14,
  },
  promoGift: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoKicker: { fontSize: 10, fontWeight: '800', color: PURPLE, letterSpacing: 0.6 },
  promoTitle: { marginTop: 3, fontSize: 14, fontWeight: '800', color: PURPLE_DEEP, lineHeight: 19 },
  promoArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
