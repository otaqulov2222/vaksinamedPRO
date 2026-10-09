import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrIcon } from '@/components/LineIcons';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { cashbackEntryLabel, cashbackSourceLabel } from '@/lib/cashbackLabels';
import type { TFunction } from '@/lib/i18n';
import type { Formatters } from '@/lib/i18n/format';

const PRIMARY = '#4B248A';
const DEEP = '#351765';
const BG = '#F8F7FB';
const YELLOW = '#FFD233';
const INK = '#17162C';
const BODY = '#3B3A52';
const MUTED = '#737487';
const MUTED_LIGHT = '#9897A9';
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
  return { title, abs, prefix, color, kind };
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

export default function CashbackScreen() {
  const insets = useSafeAreaInsets();
  const { balance, transactions, user, refresh, t, fmt } = useApp();
  const params = useLocalSearchParams<{ focus?: string; sheet?: string }>();
  const focusTier = String(params.focus || params.sheet || '').toLowerCase() === 'tier';
  const focusUsage = String(params.sheet || '').toLowerCase() === 'usage';
  const [rules, setRules] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tierSheetOpen, setTierSheetOpen] = useState(false);
  const [usageSheetOpen, setUsageSheetOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const tierY = useRef(0);

  useEffect(() => {
    if (focusUsage) {
      setUsageSheetOpen(true);
    }
  }, [focusUsage]);

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
    setTierSheetOpen(true);
    const timeout = setTimeout(() => {
      if (tierY.current > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, tierY.current - 12), animated: true });
      }
    }, 80);
    return () => clearTimeout(timeout);
  }, [focusTier]);

  const tierKey = tierKeyOf(user?.tier);
  const hasTier = Boolean(String(user?.tier || '').trim());
  const currentTierLabel = String(user?.tier || '').trim() || t('cashback.tierNone');

  // Match Home: next tier from API rules relative to current tier — never invent thresholds.
  const nextFromRules = useMemo(() => {
    const tiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    if (!tiers.length) return null;
    const threshold = (item: any) => Number(item?.fromTotal ?? item?.minSpend);
    const gold = tiers.find((item: any) => String(item.tier || '').toLowerCase().includes('gold'));
    const plat = tiers.find((item: any) => String(item.tier || '').toLowerCase().includes('plat'));
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
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };
  const goShop = () => router.push('/(tabs)/catalog');
  const goQr = () => router.push('/qr');

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 8 : Math.max(insets.top, 8) }]}>
      <View style={[styles.bar, scrolled && styles.barScrolled]}>
        <Pressable onPress={goBack} style={styles.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Feather name="arrow-left" size={20} color={DEEP} />
        </Pressable>
        <Text style={[styles.barTitle, !scrolled && styles.barTitleHidden]} numberOfLines={1} importantForAccessibility="no" aria-hidden>
          {t('common.navCashback')}
        </Text>
        <Pressable onPress={goQr} style={styles.navBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('common.navMyQr')}>
          <QrIcon size={20} color={PRIMARY} strokeWidth={1.9} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + Math.max(insets.bottom, 8) }]}
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 44)}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {t('common.navCashback')}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            <Text style={styles.subtitleStrong}>{t('cashback.introTitle')}</Text>
            {' · '}
            {t('cashback.introText')}
          </Text>
        </View>

        {/* HERO SURFACE: Balance & Membership Grouped */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.balanceLabel} numberOfLines={1}>
              {t('cashback.balanceLabel')}
            </Text>
            <View style={styles.brandMark}>
              <View style={styles.brandDot} />
              <Text style={styles.brandText}>VAKSINA MED</Text>
            </View>
          </View>

          <View
            style={styles.amountRow}
            accessible
            accessibilityRole="text"
            accessibilityLabel={t('cashback.balanceA11y', { amount: balanceText })}
          >
            {currencyBefore.trim() ? <Text style={styles.currency}>{currencyBefore.trim()}</Text> : null}
            <Text style={[styles.amount, { fontSize: amountSize, lineHeight: amountSize + 6 }]} numberOfLines={1}>
              {fmt.number(balanceValue)}
            </Text>
            {currencyAfter.trim() ? <Text style={styles.currency}>{currencyAfter.trim()}</Text> : null}
          </View>

          <View style={styles.heroDivider} />

          {/* TAP TO DISCLOSE FULL TIER SYSTEM */}
          <Pressable
            onPress={() => setTierSheetOpen(true)}
            style={({ pressed }) => [styles.memberRow, pressed && { opacity: 0.85 }]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              currentRate
                ? t('cashback.statusA11y', { tier: currentTierLabel, rate: currentRate })
                : t('cashback.tierA11y', { tier: currentTierLabel })
            }
          >
            <View style={styles.memberLeft}>
              <View style={styles.memberStatusMarker}>
                <View style={styles.memberStatusDot} />
              </View>
              <Text style={[styles.memberTier, !hasTier && styles.memberTierNone]} numberOfLines={1}>
                {t('cashback.tierMember', { tier: currentTierLabel })}
              </Text>
              {currentRate ? (
                <>
                  <Text style={styles.memberDot}>·</Text>
                  <Text style={styles.memberRate} numberOfLines={1}>
                    {t('cashback.statusRate', { rate: currentRate })}
                  </Text>
                </>
              ) : null}
            </View>
            <View style={styles.memberRight}>
              <Text style={styles.memberDetailsLink}>{t('cashback.tierDetailsA11y')}</Text>
              <Feather name="chevron-right" size={15} color={PRIMARY} importantForAccessibility="no" />
            </View>
          </Pressable>

          {/* COMPACT NEXT TIER REQUIREMENT (DIRECTLY IN HERO, NO SECOND CARD) */}
          {(next != null && left != null) || atTop ? (
            <View
              style={styles.heroNextTier}
              onLayout={(e) => {
                tierY.current = e.nativeEvent.layout.y;
              }}
            >
              {next != null && left != null ? (
                <View style={styles.nextTierContent}>
                  <View style={styles.nextTierLeft}>
                    <Feather name="trending-up" size={14} color={PRIMARY} style={styles.nextTierIcon} importantForAccessibility="no" />
                    <Text style={styles.nextTierLead} numberOfLines={1}>
                      {t('cashback.tierRemainingLead', { tier: next.label })}
                    </Text>
                  </View>
                  <Text style={styles.nextTierAmount} numberOfLines={1}>
                    {t('cashback.tierRemainingAmount', { amount: fmt.money(left) })}
                  </Text>
                </View>
              ) : atTop ? (
                <Text style={[styles.nextTierLead, styles.nextTierTop]}>
                  {t('cashback.tierTop')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* PRIMARY DOMINANT ACTION: CASHBACKDAN FOYDALANISH */}
        <Pressable
          onPress={() => setUsageSheetOpen(true)}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('cashback.useInPurchasesA11y')}
        >
          <Text style={styles.actionText} numberOfLines={1}>
            {t('cashback.useInPurchases')}
          </Text>
          <Feather name="arrow-right" size={18} color={YELLOW} importantForAccessibility="no" />
        </Pressable>

        {/* HOW IT WORKS: COMPACT EXPLANATION STRIP */}
        <Pressable
          onPress={() => setUsageSheetOpen(true)}
          style={({ pressed }) => [styles.infoStrip, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={t('cashback.usageText')}
        >
          <Feather name="info" size={16} color={PRIMARY} style={styles.infoIcon} importantForAccessibility="no" />
          <View style={styles.infoTextCol}>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {t('cashback.usageTitle')}
            </Text>
            <Text style={styles.infoText} numberOfLines={2}>
              {t('cashback.usageText')}
            </Text>
          </View>
          <Feather name="chevron-right" size={15} color={PRIMARY} style={styles.infoChevron} importantForAccessibility="no" />
        </Pressable>

        {/* CASHBACK HISTORY: CLEAN STATEMENT ROWS */}
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
              const isBonus = String(row.title).toLowerCase().includes('bonus') || item.sourceType === 'SYSTEM';
              const iconName = isBonus ? 'gift' : row.kind === 'earn' ? 'plus' : row.kind === 'use' ? 'arrow-up-right' : 'rotate-ccw';
              return (
                <View
                  key={item.id}
                  style={[styles.row, index > 0 && styles.rowRule]}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${row.title}, ${signed}, ${meta}`}
                >
                  <View style={styles.rowIconCircle}>
                    <Feather name={iconName} size={15} color={row.color} importantForAccessibility="no" />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {meta}
                    </Text>
                  </View>
                  <View style={styles.rowAmountContainer}>
                    <Text style={[styles.rowAmount, { color: row.color }]} numberOfLines={1}>
                      {signed}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* MODAL 1: TIER DETAILS (DARAJA TAFSILOTLARI) */}
      <Modal
        visible={tierSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTierSheetOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setTierSheetOpen(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTextCol}>
                <Text style={styles.sheetTitle}>{t('cashback.tierSystemTitle')}</Text>
                <Text style={styles.sheetSubtitle}>{t('cashback.tierSystemSubtitle')}</Text>
              </View>
              <Pressable
                onPress={() => setTierSheetOpen(false)}
                style={styles.sheetCloseBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('cashback.tierClose')}
              >
                <Feather name="x" size={20} color={INK} />
              </Pressable>
            </View>

            <View style={styles.tierCardsList}>
              {stops.map((stop, idx) => {
                const isCurrent = stop.key === tierKey || stop.label === currentTierLabel;
                return (
                  <View
                    key={stop.key || idx}
                    style={[styles.tierRowCard, isCurrent && styles.tierRowCardCurrent]}
                  >
                    <View style={styles.tierRowLeft}>
                      <View style={[styles.tierRowDot, isCurrent && styles.tierRowDotCurrent]} />
                      <View>
                        <View style={styles.tierTitleBadgeRow}>
                          <Text style={[styles.tierRowName, isCurrent && styles.tierRowNameCurrent]}>
                            {stop.label}
                          </Text>
                          {isCurrent ? (
                            <View style={styles.tierCurrentBadge}>
                              <Text style={styles.tierCurrentBadgeText}>
                                {t('cashback.tierCurrentBadge')}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.tierRowThreshold}>
                          {t('cashback.tierThresholdLine', { amount: fmt.money(stop.from) })}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.tierRowRate, isCurrent && styles.tierRowRateCurrent]}>
                      {stop.rate || '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Pressable
              onPress={() => setTierSheetOpen(false)}
              style={styles.sheetDoneBtn}
              accessibilityRole="button"
              accessibilityLabel={t('cashback.tierClose')}
            >
              <Text style={styles.sheetDoneBtnText}>{t('cashback.tierClose')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: CASHBACKDAN FOYDALANISH BOTTOM SHEET (VERIFIED USAGE FLOW) */}
      <Modal
        visible={usageSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUsageSheetOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setUsageSheetOpen(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTextCol}>
                <Text style={styles.sheetTitle}>{t('cashback.usageTitle')}</Text>
                <Text style={styles.sheetSubtitle}>{t('cashback.usageSubtitle')}</Text>
              </View>
              <Pressable
                onPress={() => setUsageSheetOpen(false)}
                style={styles.sheetCloseBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('cashback.usageClose')}
              >
                <Feather name="x" size={20} color={INK} />
              </Pressable>
            </View>

            <View style={styles.usageStepsList}>
              {/* STEP 1: QR-KODINGIZNI KASSIRGA KO'RSATING */}
              <View style={styles.usageStepItem}>
                <View style={styles.usageStepNumber}>
                  <Text style={styles.usageStepNumberText}>01</Text>
                </View>
                <View style={styles.usageStepBody}>
                  <Text style={styles.usageStepTitle}>{t('cashback.usageStep1Title')}</Text>
                  <Text style={styles.usageStepDesc}>{t('cashback.usageStep1Desc')}</Text>
                </View>
              </View>

              {/* STEP 2: CHEKNING 30% GACHA QISMINI TO'LANG */}
              <View style={styles.usageStepItem}>
                <View style={styles.usageStepNumber}>
                  <Text style={styles.usageStepNumberText}>02</Text>
                </View>
                <View style={styles.usageStepBody}>
                  <Text style={styles.usageStepTitle}>{t('cashback.usageStep2Title')}</Text>
                  <Text style={styles.usageStepDesc}>{t('cashback.usageStep2Desc')}</Text>
                </View>
              </View>

              {/* STEP 3: QOLGAN SUMMANI ODATIY USULDA TO'LANG */}
              <View style={styles.usageStepItem}>
                <View style={styles.usageStepNumber}>
                  <Text style={styles.usageStepNumberText}>03</Text>
                </View>
                <View style={styles.usageStepBody}>
                  <Text style={styles.usageStepTitle}>{t('cashback.usageStep3Title')}</Text>
                  <Text style={styles.usageStepDesc}>{t('cashback.usageStep3Desc')}</Text>
                </View>
              </View>

              {/* STEP 4: XARIDDAN YANGI CASHBACK OLING */}
              <View style={styles.usageStepItem}>
                <View style={styles.usageStepNumber}>
                  <Text style={styles.usageStepNumberText}>04</Text>
                </View>
                <View style={styles.usageStepBody}>
                  <Text style={styles.usageStepTitle}>{t('cashback.usageStep4Title')}</Text>
                  <Text style={styles.usageStepDesc}>{t('cashback.usageStep4Desc')}</Text>
                </View>
              </View>
            </View>

            <View style={styles.sheetActionsRow}>
              <Pressable
                onPress={() => {
                  setUsageSheetOpen(false);
                  goQr();
                }}
                style={styles.sheetQrBtn}
                accessibilityRole="button"
                accessibilityLabel={t('cashback.usageQrBtn')}
              >
                <QrIcon size={18} color="#FFFFFF" strokeWidth={2} />
                <View style={styles.sheetQrTextWrapper}>
                  <Text style={styles.sheetQrBtnText}>{t('cashback.usageQrBtn')}</Text>
                  <Text style={styles.sheetQrSubText}>{t('cashback.usageQrTtlHint')}</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  setUsageSheetOpen(false);
                  goShop();
                }}
                style={styles.sheetCatalogBtn}
                accessibilityRole="button"
                accessibilityLabel={t('cashback.usageOpenCatalog')}
              >
                <Text style={styles.sheetCatalogBtnText}>{t('cashback.usageOpenCatalog')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  /* NATIVE HEADER */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE7F4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DEEP,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  content: { paddingHorizontal: 20, paddingTop: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },

  /* COMPACT SCREEN TITLE */
  titleBlock: { marginBottom: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: INK },
  subtitle: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 19, color: MUTED },
  subtitleStrong: { fontFamily: 'Inter_600SemiBold', color: PRIMARY },

  /* HERO CARD: BALANCE & MEMBERSHIP */
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: '#ECE7F4',
    shadowColor: DEEP,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: MUTED,
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: YELLOW,
  },
  brandText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.1,
    color: PRIMARY,
  },
  amountRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  amount: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1.4,
    color: INK,
    ...NUMERIC,
  },
  currency: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    lineHeight: 26,
    color: MUTED,
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#F3EEF9',
    marginVertical: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    flexShrink: 1,
  },
  memberStatusMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(75, 36, 138, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: YELLOW,
    borderWidth: 1,
    borderColor: DEEP,
  },
  memberTier: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: INK,
  },
  memberTierNone: {
    fontSize: 14,
    color: BODY,
  },
  memberDot: {
    fontSize: 14,
    color: MUTED_LIGHT,
    fontWeight: '600',
  },
  memberRate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PRIMARY,
  },
  memberRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  memberDetailsLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: PRIMARY,
  },

  /* HERO NEXT TIER INLINE SECTION */
  heroNextTier: {
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: '#F3EEF9',
  },
  nextTierContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  nextTierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  nextTierIcon: {
    opacity: 0.85,
  },
  nextTierLead: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  nextTierAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15.5,
    lineHeight: 20,
    color: INK,
    ...NUMERIC,
  },
  nextTierTop: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    lineHeight: 19,
    color: PRIMARY,
  },

  /* PRIMARY ACTION: CASHBACKDAN FOYDALANISH */
  action: {
    marginTop: 16,
    height: 50,
    borderRadius: 15,
    backgroundColor: DEEP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    shadowColor: DEEP,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  actionPressed: {
    backgroundColor: '#260F4D',
    transform: [{ scale: 0.99 }],
  },
  actionText: {
    flexShrink: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15.5,
    letterSpacing: -0.2,
    color: '#FFFFFF',
  },

  /* HOW IT WORKS: COMPACT EXPLANATION STRIP */
  infoStrip: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE7F4',
  },
  infoIcon: { flexShrink: 0 },
  infoTextCol: { flex: 1 },
  infoTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18, color: INK },
  infoText: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 16.5, color: MUTED },
  infoChevron: { flexShrink: 0 },

  /* CASHBACK HISTORY */
  history: {
    marginTop: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: RULE,
  },
  historyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  historyTitle: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: INK,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minHeight: 44,
    minWidth: 44,
    flexShrink: 0,
  },
  seeAllText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PRIMARY,
  },

  row: {
    minHeight: 60,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowRule: {
    borderTopWidth: 1,
    borderTopColor: '#F0EDF5',
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F6F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 6,
  },
  rowTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    lineHeight: 19,
    letterSpacing: -0.2,
    color: INK,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    ...NUMERIC,
  },
  rowAmountContainer: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  rowAmount: {
    textAlign: 'right',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    ...NUMERIC,
  },

  empty: { paddingVertical: 18, gap: 4 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: INK },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 18, color: MUTED },

  /* BOTTOM SHEET MODAL STYLES */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 22, 44, 0.45)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    shadowColor: DEEP,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DFD9EA',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetHeaderTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    lineHeight: 23,
    color: INK,
  },
  sheetSubtitle: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  sheetCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* TIER SHEET LIST */
  tierCardsList: {
    gap: 10,
    marginBottom: 20,
  },
  tierRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F9F8FC',
    borderWidth: 1,
    borderColor: '#ECE7F4',
  },
  tierRowCardCurrent: {
    backgroundColor: 'rgba(75, 36, 138, 0.05)',
    borderColor: PRIMARY,
  },
  tierRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  tierRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8C2D6',
  },
  tierRowDotCurrent: {
    backgroundColor: YELLOW,
    borderWidth: 1,
    borderColor: DEEP,
  },
  tierTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierRowName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: INK,
  },
  tierRowNameCurrent: {
    color: PRIMARY,
  },
  tierCurrentBadge: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tierCurrentBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    color: '#FFFFFF',
  },
  tierRowThreshold: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    ...NUMERIC,
  },
  tierRowRate: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 21,
    color: MUTED,
    ...NUMERIC,
  },
  tierRowRateCurrent: {
    color: PRIMARY,
  },
  sheetDoneBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: DEEP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },

  /* USAGE SHEET STEPS */
  usageStepsList: {
    gap: 14,
    marginBottom: 20,
  },
  usageStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  usageStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(75, 36, 138, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usageStepNumberText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PRIMARY,
  },
  usageStepBody: {
    flex: 1,
  },
  usageStepTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    lineHeight: 19,
    color: INK,
  },
  usageStepDesc: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    color: MUTED,
  },
  sheetActionsRow: {
    gap: 10,
    marginTop: 4,
  },
  sheetQrBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: DEEP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  sheetQrTextWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetQrBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    lineHeight: 19,
    color: '#FFFFFF',
  },
  sheetQrSubText: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.72)',
  },
  sheetCatalogBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F5F2F9',
    borderWidth: 1,
    borderColor: '#ECE7F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCatalogBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    color: PRIMARY,
  },
});
