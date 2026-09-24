import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { formatUzs } from '@/components/AppUI';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F3F1F7';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const GOLD = '#C9A227';
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

const StableQR = memo(function StableQR({ value, size }: { value: string; size: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Vaksina Med loyalty QR kodi. Kassada skanerlash uchun ko‘rsating."
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
}: {
  expiresAtMs: number;
  ttlTotal: number;
  onExpire: () => void;
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
    secondsLeft > 0 ? `QR amal qiladi: ${secondsLeft} soniya` : 'QR yangilanmoqda…';

  return (
    <View
      style={styles.timerBlock}
      accessibilityLabel={label}
    >
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, { width: `${Math.max(2, progress * 100)}%` }]} />
      </View>
      <Text style={styles.timerLabel} numberOfLines={1}>
        {label}
      </Text>
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
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}) {
  return (
    <View style={styles.statTile} accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statIcon}>
        <MaterialCommunityIcons name={icon} size={16} color={PURPLE} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.statValue} numberOfLines={1}>
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
  const { user, isAuthenticated } = useApp();

  const instanceIdRef = useRef(`i${++qrInstanceSeq}`);
  const instanceId = instanceIdRef.current;

  const [card, setCard] = useState<CardPayload | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [ttlTotal, setTtlTotal] = useState(DEFAULT_TTL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
    setError('');
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
        setError('');
        const data = await api.posCard();
        if (!mounted.current) return;
        qrLog(instanceId, 'POS_CARD_RESPONSE', data?.qrPayload ? 'ok' : 'empty');
        applyCard(data);
        fetchedForIdentityRef.current = identityRef.current;
      } catch (e: any) {
        if (!mounted.current) return;
        clearCard();
        setError(e?.message || 'QR yuklanmadi');
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
  const cash = formatUzs(Math.max(0, Math.floor(Number(card?.balance) || 0)));
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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <Pressable
            style={styles.backBtn}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Orqaga"
          >
            <Feather name="chevron-left" size={20} color={PURPLE_DEEP} />
            <Text style={styles.backLabel}>Orqaga</Text>
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>
            Mening QR kodim
          </Text>
          <View style={styles.navSpacer} />
        </View>

        <Text style={styles.kicker}>VAKSINA MED · LOYALTY</Text>
        <Text style={styles.subtitle}>Kassada QR kodni ko‘rsating</Text>

        <View style={styles.qrCard}>
          {loading && !card ? (
            <View style={styles.qrCenter}>
              <ActivityIndicator color={PURPLE} size="large" />
              <Text style={styles.loadingText}>QR yuklanmoqda…</Text>
            </View>
          ) : error && !card ? (
            <View style={styles.qrCenter}>
              <MaterialCommunityIcons name="qrcode-remove" size={36} color="#B91C1C" />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={onManualRefresh}
                accessibilityRole="button"
                accessibilityLabel="Qayta urinish"
              >
                <Text style={styles.retryText}>Qayta urinish</Text>
              </Pressable>
            </View>
          ) : card ? (
            <>
              <View style={styles.qrPad}>
                <View style={{ width: qrSize, height: qrSize, alignItems: 'center', justifyContent: 'center' }}>
                  <StableQR value={card.qrPayload} size={qrSize} />
                </View>
              </View>

              {expiresAtMs > 0 ? (
                <QRExpiryTimer
                  expiresAtMs={expiresAtMs}
                  ttlTotal={ttlTotal}
                  onExpire={onExpire}
                />
              ) : null}

              {memberCode ? (
                <Text
                  style={styles.memberCode}
                  numberOfLines={1}
                  accessibilityLabel={`A’zolik kodi ${memberCode}`}
                >
                  {memberCode}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <StatTile label="Mijoz" value={firstName} icon="account" />
          <StatTile label="Cashback" value={cash} icon="wallet-outline" />
          <StatTile label="Daraja" value={tier} icon="crown-outline" />
          <StatTile label="Foiz" value={rate} icon="percent" />
        </View>

        <View style={styles.note} accessibilityRole="text">
          <Feather name="shield" size={16} color={PURPLE} />
          <Text style={styles.noteText}>
            QR kod xavfsizlik uchun muntazam yangilanadi. Kassada faqat ekrandagi QR ni skanerlang.
            Kassada ishlatish va hisoblash — shu QR orqali; yagona cashback balansi barcha
            ruxsat etilgan xarid kanallaridan.
          </Text>
        </View>

        <Pressable
          onPress={onManualRefresh}
          disabled={refreshing || !isAuthenticated}
          accessibilityRole="button"
          accessibilityLabel="QR ni yangilash"
          style={({ pressed }) => [
            styles.refreshBtn,
            (pressed || refreshing) && { opacity: 0.88 },
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Feather name="refresh-cw" size={17} color="#fff" />
          )}
          <Text style={styles.refreshText}>
            {refreshing ? 'Yangilanmoqda…' : 'QR ni yangilash'}
          </Text>
        </Pressable>
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

  kicker: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.6,
    color: GOLD,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    marginBottom: 16,
  },

  qrCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
    minHeight: 320,
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
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEE8F8',
  },
  timerBlock: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    minHeight: 36,
  },
  timerTrack: {
    width: '100%',
    height: 5,
    borderRadius: 5,
    backgroundColor: '#EEEAF6',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: '#FFCC00',
    borderRadius: 5,
  },
  timerLabel: {
    marginTop: 10,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    width: 220,
    textAlign: 'center',
  },
  memberCode: {
    marginTop: 12,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.4,
    color: MUTED,
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
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCopy: { flex: 1, minWidth: 0 },
  statLabel: {
    fontFamily: 'Inter_400Regular',
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

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: LAVENDER,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  noteText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: '#4B4463',
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
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
