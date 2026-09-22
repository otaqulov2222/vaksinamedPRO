import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
const BG = '#FFFFFF';
const GOLD = '#C9A227';
const GREEN = '#16A34A';

const TIER_META = [
  { key: 'silver', label: 'Silver', icon: 'medal-outline' as const, color: '#7C3AED', iconBg: '#EDE9FE' },
  { key: 'gold', label: 'Gold', icon: 'star-circle' as const, color: GOLD, iconBg: '#FFF4CC' },
  { key: 'platinum', label: 'Platinum', icon: 'diamond' as const, color: '#7C3AED', iconBg: '#EDE9FE' },
];

function tierKeyOf(tier?: string) {
  const t = String(tier || '').toLowerCase();
  if (t.includes('plat')) return 'platinum';
  if (t.includes('gold') || t.includes('oltin')) return 'gold';
  return 'silver';
}

function rateFromRules(tiers: any[], key: string): string | null {
  const match = tiers.find((t: any) => {
    const name = String(t.tier || '').toLowerCase();
    if (key === 'platinum') return name.includes('plat');
    if (key === 'gold') return name.includes('gold');
    return name.includes('silver');
  });
  const rate = match?.rate != null ? String(match.rate) : '';
  return rate.trim() ? rate : null;
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
  const { balance, transactions, user } = useApp();
  const [rules, setRules] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void api.cashbackRules().then(setRules).catch(() => undefined);
  }, []);

  const tierKey = tierKeyOf(user?.tier);
  const nextFromRules = useMemo(() => {
    const tiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    if (!tiers.length) return null;
    const gold = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes('gold'));
    const plat = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes('plat'));
    const threshold = (t: any) => Number(t?.fromTotal ?? t?.minSpend);
    if (tierKey === 'silver' && Number.isFinite(threshold(gold))) {
      return { label: String(gold.tier || 'Gold'), target: threshold(gold) };
    }
    if (tierKey === 'gold' && Number.isFinite(threshold(plat))) {
      return { label: String(plat.tier || 'Platinum'), target: threshold(plat) };
    }
    return null;
  }, [rules, tierKey]);
  const next = nextFromRules;
  const spent = Number(user?.total || 0);
  const left = next != null ? Math.max(0, next.target - spent) : null;
  const progress =
    next != null ? Math.min(1, Math.max(0, spent / Math.max(1, next.target))) : null;

  const tiers = useMemo(() => {
    const apiTiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    return TIER_META.map((b) => ({
      ...b,
      label: (() => {
        const match = apiTiers.find((t: any) => {
          const name = String(t.tier || '').toLowerCase();
          if (b.key === 'platinum') return name.includes('plat');
          if (b.key === 'gold') return name.includes('gold');
          return name.includes('silver');
        });
        return match?.tier ? String(match.tier) : b.label;
      })(),
      rate: rateFromRules(apiTiers, b.key),
    }));
  }, [rules]);

  const list = showAll ? transactions : transactions.slice(0, 4);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.nav}>
          <Pressable onPress={goBack} style={styles.navBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={PURPLE_DEEP} />
          </Pressable>
          <Text style={styles.navTitle}>Profil</Text>
          <Pressable onPress={() => router.push('/qr')} style={styles.navBtn}>
            <MaterialCommunityIcons name="wallet-outline" size={20} color={PURPLE} />
          </Pressable>
        </View>

        <Text style={styles.title}>Cashback</Text>
        <Text style={styles.subtitle}>Bizning ilovadagi buyurtmalardan</Text>

        {/* Balance card — coded, no pasted screen */}
        <LinearGradient
          colors={['#5C2AD6', '#4520B0', '#32168A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardLabel}>Mavjud balans</Text>
            <Pressable style={styles.useBtn} onPress={() => router.push('/(tabs)/catalog')}>
              <MaterialCommunityIcons name="credit-card-outline" size={13} color="#fff" />
              <Text style={styles.useBtnText}>To‘lovda ishlatish</Text>
              <Feather name="chevron-right" size={13} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.cardMid}>
            <Text style={styles.amount}>{formatUzs(balance)}</Text>
            <View style={styles.artWrap} pointerEvents="none">
              <MaterialCommunityIcons name="wallet" size={52} color="rgba(255,255,255,0.22)" />
              <View style={styles.coinA}>
                <MaterialCommunityIcons name="cached" size={16} color="#fff" />
              </View>
              <View style={styles.coinB} />
              <View style={styles.coinC} />
            </View>
          </View>

          {progress != null ? (
            <View style={styles.barBg}>
              <View style={[styles.barFg, { width: `${progress * 100}%` }]} />
            </View>
          ) : null}
          <Text style={styles.barHint}>
            {tierKey === 'platinum'
              ? 'Siz eng yuqori darajadasiz'
              : next != null && left != null
                ? `${next.label} darajagacha yana ${formatUzs(left)} (xaridlar)`
                : 'Keyingi daraja chegarasi serverdan'}
          </Text>
        </LinearGradient>

        {/* Tiers */}
        <View style={styles.tierRow}>
          {tiers.map((t) => {
            const on = tierKey === t.key;
            return (
              <View key={t.key} style={[styles.tier, on && styles.tierOn]}>
                <View style={[styles.tierIcon, { backgroundColor: t.iconBg }]}>
                  <MaterialCommunityIcons name={t.icon} size={20} color={t.color} />
                </View>
                <Text style={styles.tierName}>{t.label}</Text>
                <Text style={[styles.tierRate, on && { color: GOLD }]}>{t.rate ?? '—'}</Text>
              </View>
            );
          })}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.infoPct}>
            <Text style={styles.infoPctText}>%</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>
              Cashback faqat bizning ilovadagi buyurtmalardan hisoblanadi.
            </Text>
            <Text style={styles.infoSub}>
              Har bir buyurtmangizda avtomatik ravishda balansingizga tushadi.
            </Text>
          </View>
        </View>

        {/* History */}
        <View style={styles.secHead}>
          <Text style={styles.secTitle}>So‘nggi cashbacklar</Text>
          <Pressable
            style={styles.seeAll}
            onPress={() =>
              transactions.length ? setShowAll((v) => !v) : router.push('/(tabs)/catalog')
            }
          >
            <Text style={styles.seeAllText}>
              {transactions.length ? (showAll ? 'Yopish' : 'Barchasini ko‘rish') : 'Buyurtma berish'}
            </Text>
            <Feather name="chevron-right" size={14} color={PURPLE} />
          </Pressable>
        </View>

        {list.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="shopping-outline" size={26} color="#A78BFA" />
            </View>
            <Text style={styles.emptyTitle}>Hali cashback yo‘q</Text>
            <Text style={styles.emptyText}>Buyurtma bering — cashback shu yerda ko‘rinadi</Text>
          </View>
        ) : (
          list.map((item) => {
            const earn = item.kind !== 'use';
            return (
              <Pressable
                key={item.id}
                style={styles.tx}
                onPress={() => router.push('/(tabs)/purchases')}
              >
                <View style={[styles.txIcon, { backgroundColor: earn ? '#F3E8FF' : '#FFF7ED' }]}>
                  <MaterialCommunityIcons
                    name="shopping-outline"
                    size={20}
                    color={earn ? PURPLE : '#D97706'}
                  />
                </View>
                <View style={styles.txMid}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {item.title || 'Buyurtma'}
                  </Text>
                  <Text style={styles.txMeta}>{formatWhen(item.date)}</Text>
                </View>
                <Text style={[styles.txAmt, { color: earn ? GREEN : '#D97706' }]}>
                  {earn ? '+' : '−'}
                  {formatUzs(Math.abs(Number(item.cashback) || 0))}
                </Text>
                <Feather name="chevron-right" size={16} color="#C5CAD6" />
              </Pressable>
            );
          })
        )}

        {/* Promo */}
        <Pressable style={styles.promo} onPress={() => router.push('/(tabs)/catalog')}>
          <View style={styles.promoGift}>
            <MaterialCommunityIcons name="gift" size={28} color={PURPLE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.promoKicker}>KO‘PROQ IMKONIYAT</Text>
            <Text style={styles.promoTitle}>Ko‘proq buyurtma qiling – ko‘proq cashback oling!</Text>
          </View>
          <View style={styles.promoArrow}>
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
  },

  tierRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tier: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#EEF0F6',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 5,
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
  },
  secTitle: { fontSize: 16, fontWeight: '800', color: PURPLE_DEEP },
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
  txAmt: { fontSize: 13, fontWeight: '800' },

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
