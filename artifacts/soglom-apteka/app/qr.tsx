import { Feather } from '@/components/AppIcon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { BrandQrCode } from '@/components/BrandQrCode';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import type { TFunction } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#4B248A';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#64748B';
const BG = '#F4F3F8';
const CARD = '#FFFFFF';
const BORDER = '#E8E4F0';
const LAVENDER = '#F1EBFF';
const DEFAULT_TTL = 90;

type CardPayload = {
  qrPayload: string;
  cardNumber: string;
  displayCode: string;
  dynamicCode?: string;
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
  return <BrandQrCode value={value} size={size} label={label} />;
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

  const urgent = secondsLeft > 0 && secondsLeft <= 15;

  return (
    <View style={styles.timerBlock} accessibilityLabel={label}>
      <Text style={[styles.timerLabel, urgent && styles.timerLabelUrgent]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.timerTrack}>
        <View
          style={[
            styles.timerFill,
            urgent && styles.timerFillUrgent,
            { width: `${Math.max(2, progress * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
});

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

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
        && prev.dynamicCode === data.dynamicCode
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
  const memberCode = card?.dynamicCode || card?.cardNumber || '';

  const qrSize = narrow ? 200 : 220;
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
            hitSlop={8}
          >
            <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
          </Pressable>
          <View style={styles.navCopy}>
            <Text style={styles.navTitle} numberOfLines={1}>
              {t('common.navMyQr')}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {t('home.qrSubtitle')}
            </Text>
          </View>
          <View style={styles.navSpacer} />
        </View>

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
              <View style={styles.qrPad}>
                <StableQR value={card.qrPayload} size={qrSize} label={t('home.qrImageA11y')} />
              </View>

              {memberCode ? (
                <Text
                  style={styles.memberCode}
                  numberOfLines={1}
                  accessibilityLabel={t('home.qrMemberCodeA11y', { code: memberCode })}
                >
                  {memberCode}
                </Text>
              ) : null}

              {expiresAtMs > 0 ? (
                <QRExpiryTimer
                  expiresAtMs={expiresAtMs}
                  ttlTotal={ttlTotal}
                  onExpire={onExpire}
                  t={t}
                />
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('home.qrStatCustomer')}</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('common.navCashback')}</Text>
            <Text style={[styles.metaValue, styles.metaValueCash]} numberOfLines={1}>
              {cash}
            </Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('home.qrStatTier')}</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {tier}
              {rate && rate !== '—' ? ` · ${rate}` : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.noteText} accessibilityRole="text">
          {t('home.qrNote')}
        </Text>

        <Pressable
          onPress={onManualRefresh}
          disabled={refreshing || !isAuthenticated}
          accessibilityRole="button"
          accessibilityLabel={t('home.qrRefresh')}
          style={({ pressed }) => [
            styles.refreshBtn,
            (pressed || refreshing) && { opacity: 0.85 },
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Feather name="refresh-cw" size={16} color="#fff" />
          )}
          <Text style={styles.refreshText}>
            {refreshing ? t('home.qrRefreshing') : t('home.qrRefresh')}
          </Text>
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
    marginBottom: 20,
    gap: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  navCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  navTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    textAlign: 'center',
  },
  navSpacer: { width: 40 },

  qrCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    minHeight: 300,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCode: {
    marginTop: 16,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 2,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  timerBlock: {
    marginTop: 18,
    width: '72%',
    maxWidth: 220,
    alignItems: 'center',
    gap: 8,
  },
  timerLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
    textAlign: 'center',
  },
  timerLabelUrgent: {
    color: '#B45309',
  },
  timerTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#EDE9F5',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: PURPLE,
    borderRadius: 2,
  },
  timerFillUrgent: {
    backgroundColor: '#D97706',
  },

  metaCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  metaLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  metaValue: {
    flexShrink: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
    textAlign: 'right',
  },
  metaValueCash: {
    color: '#059669',
  },

  noteText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: PURPLE,
    paddingHorizontal: 16,
  },
  refreshText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
  },
});
