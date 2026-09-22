import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F4F2FB';
const CARD = '#FFFFFF';
const GOLD = '#C9A227';
const YELLOW = '#FFCC00';
const DEFAULT_TTL = 90;

const priceUz = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} so'm`;

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
};

/** QR faqat value o‘zgaganda qayta chiziladi — tebranmaydi */
const StableQR = memo(function StableQR({ value }: { value: string }) {
  return (
    <QRCode value={value} size={208} color={PURPLE_DEEP} backgroundColor="#FFFFFF" ecl="M" quietZone={8} />
  );
});

async function copyText(text: string) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** 1024px HD illustratsiya — xira emas */
function QrHeroArt() {
  return (
    <View style={styles.heroArtWrap} pointerEvents="none">
      <Image
        source={require('../assets/images/qr-hero-art.png')}
        style={styles.heroArtImg}
        resizeMode="contain"
      />
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconBg: string;
  iconColor: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.statText}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function QrScreen() {
  const insets = useSafeAreaInsets();
  const { user, balance, refresh } = useApp();

  const [card, setCard] = useState<CardPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_TTL);
  const [ttlTotal, setTtlTotal] = useState(DEFAULT_TTL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);

  const expiresAtMs = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);

  const applyCard = useCallback((data: CardPayload) => {
    const apiTtl = Math.max(30, Number(data.expiresIn) || DEFAULT_TTL);
    // Lokal countdown — server soati farqi tufayli 0 ga tushib ketmasin
    expiresAtMs.current = Date.now() + apiTtl * 1000;
    setTtlTotal(apiTtl);
    setSecondsLeft(apiTtl);
    setCard((prev) => {
      if (prev?.qrPayload === data.qrPayload) {
        return { ...prev, ...data, qrPayload: prev.qrPayload };
      }
      return data;
    });
  }, []);

  const loadCard = useCallback(
    async (manual = false) => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (manual) setRefreshing(true);
        setError('');
        const data = await api.posCard();
        if (!mounted.current) return;
        applyCard(data);
      } catch (e: any) {
        if (!mounted.current) return;
        setError(e?.message || 'QR yuklanmadi');
      } finally {
        busy.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyCard],
  );

  // Bir marta yuklash
  useEffect(() => {
    mounted.current = true;
    void loadCard(false);
    void refresh();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat mount
  }, []);

  // Barqaror sekundomer — QR ni qayta chizmaydi
  useEffect(() => {
    if (!card) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAtMs.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !busy.current) {
        void loadCard(false);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [card?.cardNumber, loadCard]);

  const progress = ttlTotal > 0 ? Math.min(1, Math.max(0, secondsLeft / ttlTotal)) : 0;

  const onCopy = async () => {
    const text = card?.cardNumber || card?.displayCode || '';
    if (!text) return;
    const ok = await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    if (Platform.OS !== 'web') {
      Alert.alert(ok ? 'Nusxa olindi' : 'Kod', text);
    } else if (!ok) {
      Alert.alert('Kod', text);
    }
  };

  const name = card?.name || user.name || 'Mijoz';
  const firstName = name.split(/\s+/)[0] || name;
  const cash = priceUz(card?.balance ?? balance);
  const tier = card?.tier || user.tier || 'Silver';
  const rate = card?.cashbackRateLabel || '—';

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <Pressable style={styles.backBtn} onPress={goBack} accessibilityLabel="Orqaga">
            <Feather name="chevron-left" size={20} color={PURPLE_DEEP} />
            <Text style={styles.backLabel}>Orqaga</Text>
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>
            Mening QR kodim
          </Text>
          <View style={styles.navSpacer} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>VAKSINA MED • LOYALTY</Text>
            <Text style={styles.heroTitle}>
              Mening QR{'\n'}kodim
            </Text>
            <Text style={styles.heroLead}>
              Kassada skaner qiling — cashback shu kod orqali hisoblanadi
            </Text>
            <View style={styles.bonusPill}>
              <MaterialCommunityIcons name="flash" size={14} color="#fff" />
              <Text style={styles.bonusPillText} numberOfLines={2}>
                Har bir xarid sizga bonus olib keladi!
              </Text>
            </View>
          </View>
          <QrHeroArt />
        </View>

        <View style={styles.qrCard}>
          {loading && !card ? (
            <View style={styles.qrCenter}>
              <ActivityIndicator color={PURPLE} size="large" />
              <Text style={styles.loadingText}>QR yuklanmoqda...</Text>
            </View>
          ) : error && !card ? (
            <View style={styles.qrCenter}>
              <MaterialCommunityIcons name="qrcode-remove" size={40} color="#B91C1C" />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void loadCard(true)}>
                <Text style={styles.retryText}>Qayta urinish</Text>
              </Pressable>
            </View>
          ) : card ? (
            <>
              <View style={styles.qrPad}>
                <StableQR value={card.qrPayload} />
              </View>

              <View style={styles.timerBlock}>
                <View style={styles.timerTrack}>
                  <View style={[styles.timerFill, { width: `${Math.max(2, progress * 100)}%` }]} />
                </View>
                <Text style={styles.timerLabel}>
                  {secondsLeft > 0 ? `Yangilanadi: ${secondsLeft}s` : 'Yangilanmoqda…'}
                </Text>
              </View>

              <View style={styles.idBox}>
                <View style={styles.idTextCol}>
                  <Text style={styles.cardNo} numberOfLines={1}>
                    {card.cardNumber}
                  </Text>
                  <Text style={styles.staticCode} numberOfLines={1}>
                    {card.displayCode}
                  </Text>
                </View>
                <Pressable style={styles.copyBtn} onPress={() => void onCopy()} accessibilityLabel="Nusxa olish">
                  <Feather name={copied ? 'check' : 'copy'} size={18} color={copied ? '#16A34A' : PURPLE} />
                </Pressable>
              </View>
              {copied ? <Text style={styles.copiedHint}>Nusxa olindi</Text> : null}
            </>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Mijoz" value={firstName} icon="account" iconBg="#EDE5FF" iconColor={PURPLE} />
          <StatCard label="Cashback" value={cash} icon="cash-multiple" iconBg="#DDF5F0" iconColor="#0D9488" />
          <StatCard label="Daraja" value={tier} icon="crown" iconBg="#FFF4CC" iconColor={GOLD} />
          <StatCard label="Foiz" value={rate} icon="percent" iconBg="#E8E4FF" iconColor={PURPLE} />
        </View>

        <Pressable style={styles.tip} onPress={() => setTipOpen((v) => !v)}>
          <View style={styles.tipIcon}>
            <Feather name="shield" size={18} color="#2563EB" />
          </View>
          <View style={styles.tipBody}>
            <Text style={styles.tipTitle}>Dinamik QR 90 soniyada yangilanadi.</Text>
            <Text style={styles.tipText}>Kodni boshqalarga yubormang — bu sizning hisobingiz.</Text>
            {tipOpen ? (
              <Text style={styles.tipExtra}>
                Muddat tugaganda kod avtomatik yangilanadi. Kassada faqat ekrandagi QR ni skanerlang.
              </Text>
            ) : null}
          </View>
          <Feather name={tipOpen ? 'chevron-up' : 'chevron-right'} size={18} color={MUTED} />
        </Pressable>

        <Pressable
          onPress={() => void loadCard(true)}
          disabled={refreshing}
          style={({ pressed }) => [{ opacity: pressed || refreshing ? 0.88 : 1 }]}
        >
          <LinearGradient
            colors={['#7B3FE4', '#5B1FD0', '#4A18B8']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.refreshBtn}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Feather name="refresh-cw" size={18} color="#fff" />
            )}
            <Text style={styles.refreshText}>{refreshing ? 'Yangilanmoqda...' : 'QR ni yangilash'}</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
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
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  navSpacer: { width: 88 },

  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 10,
  },
  heroCopy: { flex: 1, minWidth: 0, paddingTop: 6 },
  kicker: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: GOLD,
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    lineHeight: 30,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  heroLead: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
  },
  bonusPill: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 12,
    maxWidth: '100%',
  },
  bonusPillText: {
    flexShrink: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#fff',
    lineHeight: 14,
  },
  heroArtWrap: {
    width: 168,
    height: 168,
    marginRight: -6,
    marginTop: -8,
  },
  heroArtImg: {
    width: '100%',
    height: '100%',
  },

  qrCard: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#1A1040',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    marginBottom: 14,
    minHeight: 360,
  },
  qrCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 48,
    minHeight: 280,
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
    backgroundColor: YELLOW,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },

  qrPad: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EEE8F8',
  },

  timerBlock: {
    marginTop: 18,
    width: '100%',
    alignItems: 'center',
  },
  timerTrack: {
    width: '100%',
    height: 6,
    borderRadius: 6,
    backgroundColor: '#EEEAF6',
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: YELLOW,
    borderRadius: 6,
  },
  timerLabel: {
    marginTop: 10,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: MUTED,
    letterSpacing: 0.2,
  },

  idBox: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F1F8',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  idTextCol: { flex: 1, minWidth: 0 },
  cardNo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    letterSpacing: 0.8,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  staticCode: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    letterSpacing: 0.6,
  },
  copyBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EDE5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiedHint: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#16A34A',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 12,
  },
  statCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statText: { flex: 1, minWidth: 0 },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  statValue: {
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },

  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EEF4FF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#DBE7FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipBody: { flex: 1, minWidth: 0 },
  tipTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  tipText: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
  },
  tipExtra: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  refreshText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#fff',
  },
});
