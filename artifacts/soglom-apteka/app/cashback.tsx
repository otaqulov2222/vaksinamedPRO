import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrIcon } from '@/components/LineIcons';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { cashbackEntryLabel, cashbackSourceLabel } from '@/lib/cashbackLabels';
import type { TFunction } from '@/lib/i18n';
import type { Formatters } from '@/lib/i18n/format';

const PRIMARY = '#4B248A';
const DEEP = '#351765';
const TRACK = '#E6DFF2';
const BG = '#F8F7FB';
const YELLOW = '#FFD233';
const INK = '#17162C';
const BODY = '#3B3A52';
const MUTED = '#737487';
const POSITIVE = '#16A34A';
const NEGATIVE = '#DC2626';
const RULE = '#ECE9F2';
const NUMERIC = { fontVariant: ['tabular-nums' as const] };

type LedgerKind = 'earn' | 'use' | 'void';
type TierStop = { label: string; key: string; rate: string | null; from: number };

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
 * Source label is the localized mirror of the server sourceLabel (present only when the server knows the channel)
 * — never invent channel from branch alone.
 */
function ledgerPresentation(
  t: TFunction,
  item: {
    kind?: string;
    cashback?: number;
    sourceLabel?: string;
    sourceType?: string | null;
    entryType?: string;
  },
) {
  const kind = ledgerKindOf(item.kind);
  const raw = Number(item.cashback);
  const amount = Number.isFinite(raw) ? raw : 0;
  const abs = Math.abs(amount);
  const hasSource = Boolean(item.sourceType || String(item.sourceLabel || '').trim());
  const entryType = item.entryType || (kind === 'use' ? 'USE' : kind === 'void' ? 'REVERSAL' : 'EARN');
  const sourceLabel = hasSource ? cashbackSourceLabel(t, item.sourceType, entryType) : '';
  const entryLabel = cashbackEntryLabel(t, kind);
  const prefix =
    kind === 'earn' ? ('+' as const) : kind === 'use' ? ('−' as const) : amount > 0 ? ('+' as const) : amount < 0 ? ('−' as const) : ('' as const);
  const color = kind === 'earn' ? POSITIVE : kind === 'use' ? NEGATIVE : MUTED;
  // Earnings are named by where they came from; spending and reversals by what happened.
  const title = kind === 'earn' ? sourceLabel || entryLabel : entryLabel;
  return { title, abs, prefix, color };
}

function tierKeyOf(tier?: string) {
  const t = String(tier || '').toLowerCase();
  if (t.includes('plat')) return 'platinum';
  if (t.includes('gold') || t.includes('oltin')) return 'gold';
  if (t.includes('silver') || t.includes('kumush')) return 'silver';
  return 'default';
}

function toDate(raw?: string) {
  if (!raw || !/^\d{4}-\d{2}/.test(raw)) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Statement date: "05 okt · 09:25" this year, the full date with year otherwise. */
function ledgerDate(fmt: Formatters, raw?: string) {
  const d = toDate(raw);
  if (!d) return String(raw || '');
  if (d.getFullYear() !== new Date().getFullYear()) return fmt.date(d, { withYear: true });
  return `${fmt.date(d, { short: true })} · ${fmt.time(d)}`;
}

/** One stretch of the tier path; the marker shows where the member is between two tiers. */
function PathSegment({ fill, marker }: { fill: number; marker: boolean }) {
  const pct = `${Math.round(fill * 1000) / 10}%` as const;
  return (
    <View style={styles.segment}>
      <View style={styles.segmentTrack} />
      <View style={[styles.segmentFill, { width: pct }]} />
      {marker ? <View style={[styles.marker, { left: pct }]} /> : null}
    </View>
  );
}

/** Silver ───●─── Gold ─── Platinum: every tier from the rules API, the member's position on it. */
function TierPath({ stops, currentIndex, spent }: { stops: TierStop[]; currentIndex: number; spent: number }) {
  const markerAt = currentIndex + 1;
  const from = currentIndex >= 0 ? stops[currentIndex].from : 0;
  const to = stops[markerAt]?.from;
  const fraction = to != null ? Math.min(1, Math.max(0, (spent - from) / Math.max(1, to - from))) : 1;
  const fillFor = (i: number) => (i <= currentIndex ? 1 : i === markerAt ? fraction : 0);
  return (
    <View style={styles.path} importantForAccessibility="no-hide-descendants">
      {currentIndex < 0 ? <PathSegment fill={fraction} marker /> : null}
      {stops.map((stop, i) => (
        <React.Fragment key={`${stop.key}-${stop.from}`}>
          {i > 0 ? <PathSegment fill={fillFor(i)} marker={i === markerAt} /> : null}
          <Text
            style={[styles.pathLabel, i < currentIndex && styles.pathLabelPast, i === currentIndex && styles.pathLabelCurrent]}
            numberOfLines={1}
          >
            {stop.label}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

export default function CashbackScreen() {
  const insets = useSafeAreaInsets();
  const { balance, transactions, user, refresh, t, fmt } = useApp();
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusTier = String(params.focus || '').toLowerCase() === 'tier';
  const [rules, setRules] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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
  const hasTier = Boolean(String(user?.tier || '').trim());
  const currentTierLabel = String(user?.tier || '').trim() || t('cashback.tierNone');

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

  /** Tier stops straight from the rules API (label, rate, threshold); nothing invented when rules are missing. */
  const stops = useMemo<TierStop[]>(() => {
    const apiTiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    return apiTiers
      .map((tier: any) => ({
        label: String(tier.tier || '').trim() || '—',
        key: tierKeyOf(tier.tier),
        rate: tier?.rate != null ? String(tier.rate).trim() || null : null,
        from: Number(tier?.fromTotal ?? tier?.minSpend),
      }))
      .filter((s: TierStop) => Number.isFinite(s.from))
      .sort((a: TierStop, b: TierStop) => a.from - b.from);
  }, [rules]);

  const currentIndex = stops.findIndex((s) => s.key === tierKey || s.label === currentTierLabel);
  const currentRate = currentIndex >= 0 ? stops[currentIndex].rate : null;
  const atTop =
    Array.isArray(rules?.tiers) &&
    rules.tiers.length > 0 &&
    next == null &&
    Number.isFinite(spent) &&
    hasTier;

  const list = showAll ? transactions : transactions.slice(0, 4);
  const balanceValue = Math.max(0, Math.floor(Number(balance) || 0));
  const balanceText = fmt.money(balanceValue);
  const [currencyBefore, currencyAfter] = t('common.moneyAmount', { amount: '\u0000' }).split('\u0000');
  const digits = String(balanceValue).length;
  const amountSize = digits >= 7 ? 40 : digits === 6 ? 44 : 48;
  const remainingA11y =
    next != null && left != null
      ? `${t('cashback.tierRemainingLead', { tier: next.label })} ${t('cashback.tierRemainingAmount', { amount: fmt.money(left) })}`
      : atTop
        ? t('cashback.tierTop')
        : t('cashback.tierThresholdPending');

  const goBack = () => {
    // Stack-aware: Profile/Help/Home → Cashback → Back returns to that parent.
    // Direct open / no history → Profile (not Home).
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };
  const goShop = () => router.push('/(tabs)/catalog');
  const goQr = () => router.push('/qr');

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 8 : Math.max(insets.top, 8) }]}>
      <View style={[styles.bar, scrolled && styles.barScrolled]}>
        <Pressable onPress={goBack} style={styles.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Feather name="arrow-left" size={20} color={INK} />
        </Pressable>
        <Text style={[styles.barTitle, !scrolled && styles.barTitleHidden]} numberOfLines={1} importantForAccessibility="no" aria-hidden>
          {t('common.navCashback')}
        </Text>
        <Pressable onPress={goQr} style={styles.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('common.navMyQr')}>
          <QrIcon size={19} color={PRIMARY} strokeWidth={1.8} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + Math.max(insets.bottom, 8) }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 44)}
      >
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {t('common.navCashback')}
        </Text>
        <Text style={styles.introTitle}>{t('cashback.introTitle')}</Text>
        <Text style={styles.introText}>{t('cashback.introText')}</Text>

        <View style={styles.balance} accessible accessibilityRole="text" accessibilityLabel={t('cashback.balanceA11y', { amount: balanceText })}>
          <Text style={styles.balanceLabel} numberOfLines={1}>
            {t('cashback.balanceLabel')}
          </Text>
          <View style={styles.amountRow}>
            {currencyBefore.trim() ? <Text style={styles.currency}>{currencyBefore.trim()}</Text> : null}
            <Text style={[styles.amount, { fontSize: amountSize, lineHeight: amountSize + 8 }]} numberOfLines={1}>
              {fmt.number(balanceValue)}
            </Text>
            {currencyAfter.trim() ? <Text style={styles.currency}>{currencyAfter.trim()}</Text> : null}
          </View>
        </View>

        <View
          onLayout={(e) => {
            tierY.current = e.nativeEvent.layout.y;
          }}
          accessibilityLabel={focusTier ? t('cashback.tierDetailsA11y') : undefined}
        >
          <View
            style={styles.member}
            accessible
            accessibilityRole="text"
            accessibilityLabel={
              currentRate
                ? t('cashback.statusA11y', { tier: currentTierLabel, rate: currentRate })
                : t('cashback.tierA11y', { tier: currentTierLabel })
            }
          >
            <Text style={[styles.memberTier, !hasTier && styles.memberTierNone]} numberOfLines={1}>
              {currentTierLabel}
            </Text>
            {currentRate ? (
              <Text style={styles.memberRate} numberOfLines={1}>
                {t('cashback.statusRate', { rate: currentRate })}
              </Text>
            ) : null}
          </View>

          <View
            style={styles.progress}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={next != null ? t('cashback.tierProgressToA11y', { tier: next.label }) : t('cashback.tierProgressA11y')}
            accessibilityValue={{ min: 0, max: 100, now: Math.round((progress ?? 1) * 100), text: remainingA11y }}
          >
            {stops.length > 1 ? <TierPath stops={stops} currentIndex={currentIndex} spent={spent} /> : null}
            {next != null && left != null ? (
              <View style={styles.remaining}>
                <Text style={styles.remainingLead}>{t('cashback.tierRemainingLead', { tier: next.label })}</Text>
                <Text style={styles.remainingAmount}>{t('cashback.tierRemainingAmount', { amount: fmt.money(left) })}</Text>
              </View>
            ) : (
              <Text style={[styles.remaining, atTop ? styles.remainingTop : styles.remainingLead]}>
                {atTop ? t('cashback.tierTop') : t('cashback.tierThresholdPending')}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          onPress={goShop}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('cashback.useInPurchasesA11y')}
        >
          <Text style={styles.actionText} numberOfLines={1}>
            {t('cashback.useInPurchases')}
          </Text>
          <Feather name="arrow-right" size={18} color={YELLOW} importantForAccessibility="no" />
        </Pressable>

        <View style={styles.info}>
          <Feather name="info" size={14} color={MUTED} style={styles.infoIcon} importantForAccessibility="no" />
          <Text style={styles.infoText}>{t('cashback.infoLine')}</Text>
        </View>

        <View style={styles.history}>
          <View style={styles.historyHead}>
            <Text style={styles.historyTitle} accessibilityRole="header" accessibilityLabel={t('cashback.historyA11y')}>
              {t('cashback.historyTitle')}
            </Text>
            <Pressable
              style={styles.seeAll}
              hitSlop={8}
              onPress={() => (transactions.length ? setShowAll((v) => !v) : goShop())}
              accessibilityRole="button"
              accessibilityLabel={
                transactions.length
                  ? showAll
                    ? t('cashback.historyCollapseA11y')
                    : t('cashback.historyShowAllA11y')
                  : t('cashback.shopAction')
              }
            >
              <Text style={styles.seeAllText}>
                {transactions.length ? (showAll ? t('common.showLess') : t('cashback.historyAll')) : t('cashback.shopAction')}
              </Text>
              <Feather name={showAll ? 'chevron-up' : 'arrow-right'} size={14} color={PRIMARY} importantForAccessibility="no" />
            </Pressable>
          </View>

          {list.length === 0 ? (
            <View style={styles.empty} accessible accessibilityRole="text">
              <Text style={styles.emptyTitle}>{t('cashback.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('cashback.emptyText')}</Text>
            </View>
          ) : (
            list.map((item, index) => {
              const row = ledgerPresentation(t, item);
              const amt = fmt.money(row.abs);
              const signed = row.prefix ? `${row.prefix}${amt}` : amt;
              const branch = String(item.branchName || item.branch || '').trim();
              const date = ledgerDate(fmt, item.createdAt || item.date);
              const meta = [date, branch].filter(Boolean).join(' · ');
              return (
                <View
                  key={item.id}
                  style={[styles.row, index > 0 && styles.rowRule]}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${row.title}, ${signed}, ${meta}`}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {row.title}
                    </Text>
                    <Text style={[styles.rowAmount, { color: row.color }]} numberOfLines={1}>
                      {signed}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>{meta}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  barScrolled: { borderBottomColor: RULE },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 16, color: INK },
  barTitleHidden: { opacity: 0 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: RULE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: 20, paddingTop: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },

  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: INK },
  introTitle: { marginTop: 8, fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: PRIMARY },
  introText: { marginTop: 1, fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 19, color: MUTED },

  balance: { marginTop: 28 },
  balanceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase', color: MUTED },
  amountRow: { marginTop: 4, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amount: { flexShrink: 1, fontFamily: 'Inter_700Bold', letterSpacing: -1.4, color: INK, ...NUMERIC },
  currency: { fontFamily: 'Inter_600SemiBold', fontSize: 22, color: MUTED },

  member: { marginTop: 20 },
  memberTier: { fontFamily: 'Inter_600SemiBold', fontSize: 20, lineHeight: 26, color: PRIMARY },
  memberTierNone: { fontSize: 16, lineHeight: 22, color: BODY },
  memberRate: { marginTop: 2, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 19, color: BODY },

  progress: { marginTop: 24 },
  path: { flexDirection: 'row', alignItems: 'center' },
  pathLabel: { flexShrink: 0, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, color: MUTED },
  pathLabelPast: { color: BODY },
  pathLabelCurrent: { fontFamily: 'Inter_700Bold', color: PRIMARY },
  segment: { flex: 1, minWidth: 28, height: 14, marginHorizontal: 10, justifyContent: 'center' },
  segmentTrack: { height: 2, borderRadius: 1, backgroundColor: TRACK },
  segmentFill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: PRIMARY },
  marker: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: PRIMARY,
    backgroundColor: YELLOW,
  },
  remaining: { marginTop: 16 },
  remainingLead: { fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 19, color: MUTED },
  remainingAmount: { marginTop: 2, fontFamily: 'Inter_600SemiBold', fontSize: 19, lineHeight: 25, color: INK, ...NUMERIC },
  remainingTop: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 21, color: INK },

  action: {
    marginTop: 24,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: PRIMARY,
  },
  actionPressed: { backgroundColor: DEEP },
  actionText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15.5, color: '#FFFFFF' },

  info: { marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoIcon: { marginTop: 2 },
  infoText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 18, color: MUTED },

  history: { marginTop: 32, paddingTop: 8, borderTopWidth: 1, borderTopColor: RULE },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  historyTitle: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 18, lineHeight: 24, color: INK },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minHeight: 44, minWidth: 44, flexShrink: 0 },
  seeAllText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: PRIMARY },

  row: { paddingVertical: 14 },
  rowRule: { borderTopWidth: 1, borderTopColor: RULE },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  rowTitle: { flex: 1, minWidth: 0, fontFamily: 'Inter_500Medium', fontSize: 15.5, lineHeight: 21, color: INK },
  rowAmount: { flexShrink: 0, maxWidth: '50%', textAlign: 'right', fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 21, ...NUMERIC },
  rowMeta: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 17, color: MUTED, ...NUMERIC },

  empty: { paddingVertical: 14, gap: 4 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: INK },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 18, color: MUTED },
});
