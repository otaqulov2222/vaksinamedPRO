import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CrownIcon } from '@/components/LineIcons';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { TFunction } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#4B248A';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#64748B';
const BG = '#F7F6FA';
const CARD = '#FFFFFF';
const BORDER = '#EFEBF6';
const LAVENDER = '#F1EBFF';
const GOLD = '#D97706';
const DEFAULT_TTL = 90;

type CardPayload = {
  qrPayload: string;
  cardNumber: string;
  displayCode: string;
  expiresAt: string;
  expiresIn: number;
  balance: number;
  tier: string;
  name: string;
  cashbackRateLabel: string;
  scanMode?: string;
  ttlSeconds?: number;
};

let qrInstanceSeq = 0;

function qrLog(instanceId: string, event: string, detail?: string) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[QR] ${event}${detail ? ` ${detail}` : ''} #${instanceId}`);
}

const StableQR = memo(function StableQR({ value, size, label }: { value: string; size: number; label: string }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <QRCode value={value} size={size} color={PURPLE_DEEP} backgroundColor="#FFFFFF" ecl="M" quietZone={10} />
    </View>
  );
});

/** Isolated timer — only this subtree re-renders each second. */
const QRExpiryTimer = memo(function QRExpiryTimer({
  expiresAtMs,
  ttlTotal,
  onExpire,
  t,
}: {
  expiresAtMs: number;
  ttlTotal: number;
  onExpire: () => void;
  t: TFunction;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)),
  );
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  const progress = ttlTotal > 0 ? Math.min(1, Math.max(0, secondsLeft / ttlTotal)) : 0;
  const label =
    secondsLeft > 0 ? t('home.qrValidFor', { seconds: secondsLeft }) : t('home.qrRenewing');

  return (
    <View
      style={styles.timerBlock}
      accessibilityLabel={label}
    >
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, { width: `${Math.max(2, progress * 100)}%` }]} />
      </View>
      <View style={styles.timerLabelRow}>
        <View style={styles.timerLiveDot} />
        <Text style={styles.timerLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
});

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

const StatTile = memo(function StatTile({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconBg?: string;
  iconColor?: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statTile} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.statIcon, iconBg ? { backgroundColor: iconBg } : null]}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor || PURPLE} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.statValue, highlight && styles.statValueHighlight]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
});

export default function QrScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < 390;
  const { t, fmt, user, isAuthenticated } = useApp();

  const instanceIdRef = useRef(`i${++qrInstanceSeq}`);
  const instanceId = instanceIdRef.current;

  const [card, setCard] = useState<CardPayload | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [ttlTotal, setTtlTotal] = useState(DEFAULT_TTL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ cause: unknown } | null>(null);

  const busy = useRef(false);
  const mounted = useRef(true);
  const cardRef = useRef<CardPayload | null>(null);
  const identityKey = `${isAuthenticated ? '1' : '0'}|${user.phone}`;
  const identityRef = useRef(identityKey);
  const fetchedForIdentityRef = useRef('');

  useEffect(() => {
    mounted.current = true;
    qrLog(instanceId, 'MOUNT');
    return () => {
      mounted.current = false;
      qrLog(instanceId, 'UNMOUNT');
    };
  }, [instanceId]);

  const applyCard = useCallback((data: CardPayload) => {
    const apiTtl = Math.max(30, Number(data.ttlSeconds ?? data.expiresIn) || DEFAULT_TTL);
    const until = Date.now() + apiTtl * 1000;
    setTtlTotal(apiTtl);
    setExpiresAtMs(until);
    setCard((prev) => {
      let next: CardPayload;
      if (
        prev
        && prev.qrPayload === data.qrPayload
        && prev.balance === data.balance
        && prev.tier === data.tier
        && prev.name === data.name
        && prev.cashbackRateLabel === data.cashbackRateLabel
        && prev.cardNumber === data.cardNumber
      ) {
        next = prev;
      } else if (prev?.qrPayload === data.qrPayload) {
        next = { ...prev, ...data, qrPayload: prev.qrPayload };
      } else {
        next = data;
      }
      cardRef.current = next;
      return next;
    });
  }, []);

  const clearCard = useCallback(() => {
    cardRef.current = null;
    setCard(null);
    setExpiresAtMs(0);
    setError(null);
  }, []);

  const loadCard = useCallback(
    async (reason: 'focus' | 'manual' | 'expire' | 'identity') => {
      if (!isAuthenticated) {
        clearCard();
        setLoading(false);
        return;
      }
      if (busy.current) return;
      busy.current = true;
      qrLog(instanceId, 'POS_CARD_FETCH', reason);
      try {
        if (reason === 'manual') setRefreshing(true);
        setError(null);
        const data = await api.posCard();
        if (!mounted.current) return;
        qrLog(instanceId, 'POS_CARD_RESPONSE', data?.qrPayload ? 'ok' : 'empty');
        applyCard(data);
        fetchedForIdentityRef.current = identityRef.current;
      } catch (e: unknown) {
        if (!mounted.current) return;
        clearCard();
        setError({ cause: e });
      } finally {
        busy.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyCard, clearCard, isAuthenticated, instanceId],
  );

  const loadCardRef = useRef(loadCard);
  loadCardRef.current = loadCard;

  // Stable focus/blur — empty deps; NO clearCard, NO global refresh().
  useFocusEffect(
    useCallback(() => {
      qrLog(instanceId, 'FOCUS');
      const id = identityRef.current;
      const hasCard = Boolean(cardRef.current);
      if (!hasCard || fetchedForIdentityRef.current !== id) {
        setLoading(!hasCard);
        void loadCardRef.current('focus');
      }
      return () => {
        qrLog(instanceId, 'BLUR');
      };
    }, [instanceId]),
  );

  // Account switch only — phone/auth identity, not display name flicker.
  useEffect(() => {
    const prev = identityRef.current;
    if (prev !== identityKey) {
      qrLog(instanceId, 'IDENTITY_CHANGE', `${prev} -> ${identityKey}`);
      identityRef.current = identityKey;
      fetchedForIdentityRef.current = '';
      clearCard();
      setLoading(true);
      void loadCard('identity');
    } else {
      identityRef.current = identityKey;
    }
  }, [identityKey, clearCard, loadCard, instanceId]);

  const onExpire = useCallback(() => {
    void loadCard('expire');
  }, [loadCard]);

  const onManualRefresh = useCallback(() => {
    if (busy.current || refreshing) return;
    void loadCard('manual');
  }, [loadCard, refreshing]);

  // Prefer card payload for display — avoid AppContext churn affecting stats.
  const name = card?.name?.trim() || '—';
  const firstName = name.split(/\s+/)[0] || name;
  const cash = fmt.money(Math.max(0, Math.floor(Number(card?.balance) || 0)));
  const tier = card?.tier?.trim() || '—';
  const rate = card?.cashbackRateLabel || '—';
  const memberCode = card?.cardNumber || '';

  const qrSize = narrow ? 184 : 200;
  const sidePad = narrow ? 14 : 18;
  const bottomPad = 28 + Math.max(insets.bottom, 8);

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: sidePad, paddingBottom: bottomPad }]}
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.nav}>
          <Pressable
            style={styles.backBtn}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Feather name="chevron-left" size={20} color={PURPLE_DEEP} />
            <Text style={styles.backLabel}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>
            {t('common.navMyQr')}
          </Text>
          <View style={styles.navSpacer} />
        </View>

        <View style={styles.kickerBadge}>
          <Feather name="award" size={13} color={GOLD} />
          <Text style={styles.kicker}>{t('home.qrKicker')}</Text>
        </View>
        <Text style={styles.subtitle}>{t('home.qrSubtitle')}</Text>

        <View style={styles.qrCard}>
          {loading && !card ? (
            <View style={styles.qrCenter}>
              <ActivityIndicator color={PURPLE} size="large" />
              <Text style={styles.loadingText}>{t('home.qrLoading')}</Text>
            </View>
          ) : error && !card ? (
            <View style={styles.qrCenter}>
              <MaterialCommunityIcons name="qrcode-remove" size={36} color="#B91C1C" />
              <Text style={styles.errorText}>
                {localizeError(error.cause, t, { fallback: 'home.qrLoadFailed' })}
              </Text>
              <Pressable
                style={styles.retryBtn}
                onPress={onManualRefresh}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
              >
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : card ? (
            <>
              <View style={styles.cardHeader}>
                <View style={styles.cardBrandBadge}>
                  <View style={styles.cardBrandDot} />
                  <Text style={styles.cardBrandText}>VAKSINA MED</Text>
                </View>
                {tier && tier !== '—' ? (
                  <View style={styles.cardTierBadge}>
                    <CrownIcon size={12} color="#B45309" strokeWidth={2.2} />
                    <Text style={styles.cardTierText}>{tier}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.qrPad}>
                <View style={[styles.scannerCorner, styles.cornerTL]} />
                <View style={[styles.scannerCorner, styles.cornerTR]} />
                <View style={[styles.scannerCorner, styles.cornerBL]} />
                <View style={[styles.scannerCorner, styles.cornerBR]} />
                <View style={{ width: qrSize, height: qrSize, alignItems: 'center', justifyContent: 'center' }}>
                  <StableQR value={card.qrPayload} size={qrSize} label={t('home.qrImageA11y')} />
                </View>
              </View>

              {expiresAtMs > 0 ? (
                <QRExpiryTimer
                  expiresAtMs={expiresAtMs}
                  ttlTotal={ttlTotal}
                  onExpire={onExpire}
                  t={t}
                />
              ) : null}

              {memberCode ? (
                <View style={styles.memberCodeBox}>
                  <Text
                    style={styles.memberCode}
                    numberOfLines={1}
                    accessibilityLabel={t('home.qrMemberCodeA11y', { code: memberCode })}
                  >
                    {memberCode}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <StatTile
            label={t('home.qrStatCustomer')}
            value={firstName}
            icon="account"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
          />
          <StatTile
            label={t('common.navCashback')}
            value={cash}
            icon="wallet-outline"
            iconBg="#ECFDF5"
            iconColor="#059669"
            highlight
          />
          <StatTile
            label={t('home.qrStatTier')}
            value={tier}
            icon="crown-outline"
            iconBg="#FFFDF5"
            iconColor="#D97706"
          />
          <StatTile
            label={t('home.qrStatRate')}
            value={rate}
            icon="percent"
            iconBg="#F5F3FF"
            iconColor="#7C3AED"
          />
        </View>

        <View style={styles.note} accessibilityRole="text">
          <Feather name="shield" size={16} color={PURPLE} />
          <Text style={styles.noteText}>{t('home.qrNote')}</Text>
        </View>

        <Pressable
          onPress={onManualRefresh}
          disabled={refreshing || !isAuthenticated}
          accessibilityRole="button"
          accessibilityLabel={t('home.qrRefresh')}
          style={({ pressed }) => [
            styles.refreshBtnWrapper,
            (pressed || refreshing) && { opacity: 0.88 },
          ]}
        >
          <LinearGradient
            colors={['#4B248A', '#351765']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.refreshBtnGradient}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Feather name="refresh-cw" size={17} color="#fff" />
            )}
            <Text style={styles.refreshText}>
              {refreshing ? t('home.qrRefreshing') : t('home.qrRefresh')}
            </Text>
          </LinearGradient>
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
    overflow: 'hidden',
  },
  scroll: { flex: 1, width: '100%', maxWidth: '100%' },
  content: {
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: CARD,
    borderRadius: 12,
    paddingVertical: 8,
    paddingLeft: 6,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  backLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: PURPLE_DEEP,
  },
  navSpacer: { width: 88 },

  kickerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
    marginBottom: 8,
  },
  kicker: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.6,
    color: GOLD,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: '#4B4463',
    marginBottom: 16,
  },

  qrCard: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#EDE8F5',
    marginBottom: 14,
    minHeight: 330,
    boxShadow: '0px 8px 28px rgba(75,36,138,0.08), 0px 1px 3px rgba(23,22,44,0.03)',
  },
  cardHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F6F2FC',
  },
  cardBrandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: PURPLE,
  },
  cardBrandText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    color: PURPLE,
  },
  cardTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  cardTierText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: GOLD,
  },
  qrCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 48,
    minHeight: 260,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  retryBtn: {
    backgroundColor: LAVENDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  qrPad: {
    position: 'relative',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#EBE5F5',
  },
  scannerCorner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: PURPLE,
  },
  cornerTL: {
    top: 6,
    left: 6,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopLeftRadius: 5,
  },
  cornerTR: {
    top: 6,
    right: 6,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopRightRadius: 5,
  },
  cornerBL: {
    bottom: 6,
    left: 6,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderBottomLeftRadius: 5,
  },
  cornerBR: {
    bottom: 6,
    right: 6,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomRightRadius: 5,
  },
  timerBlock: {
    marginTop: 18,
    width: '100%',
    alignItems: 'center',
    minHeight: 40,
  },
  timerTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1EDF9',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  timerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
  },
  timerLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  timerLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  memberCodeBox: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F7F5FA',
    borderWidth: 1,
    borderColor: '#EDE8F5',
  },
  memberCode: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.5,
    color: PURPLE_DEEP,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 14,
  },
  statTile: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1.5,
    borderColor: BORDER,
    boxShadow: '0px 2px 10px rgba(75,36,138,0.03)',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCopy: { flex: 1, minWidth: 0 },
  statLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
  },
  statValue: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  statValueHighlight: {
    color: '#059669',
  },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F8F6FC',
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EDE8F6',
  },
  noteText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#4B4463',
  },

  refreshBtnWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 6px 20px rgba(75,36,138,0.22)',
  },
  refreshBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  refreshText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
  },
});
