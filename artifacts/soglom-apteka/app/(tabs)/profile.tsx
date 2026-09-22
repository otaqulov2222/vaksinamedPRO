import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Alert,
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

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const GOLD = '#C9A227';

type MenuIcon =
  | { kind: 'feather'; name: React.ComponentProps<typeof Feather>['name']; color: string; bg: string }
  | { kind: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string; bg: string };

type MenuRow = {
  key: string;
  label: string;
  value?: string;
  icon: MenuIcon;
  onPress: () => void;
};

function formatPhone(phone: string) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) {
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  if (d.length === 9) {
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return phone || '—';
}

function tierLabel(tier: string) {
  const t = String(tier || '').toLowerCase();
  if (t.includes('gold') || t.includes('oltin')) return 'Gold';
  if (t.includes('silver') || t.includes('kumush')) return 'Silver';
  if (t.includes('bronze') || t.includes('bronza')) return 'Bronze';
  return tier || 'Silver';
}

function MenuIconBox({ icon }: { icon: MenuIcon }) {
  return (
    <View style={[styles.iconBox, { backgroundColor: icon.bg }]}>
      {icon.kind === 'feather' ? (
        <Feather name={icon.name} size={18} color={icon.color} />
      ) : (
        <MaterialCommunityIcons name={icon.name} size={18} color={icon.color} />
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, language, balance, logout } = useApp();

  const initial = useMemo(() => {
    const n = String(user.name || 'M').trim();
    return (n[0] || 'M').toUpperCase();
  }, [user.name]);

  const levelName = tierLabel(user.tier);
  const levelFull = `${levelName} daraja`;
  const cashbackText = formatUzs(user.saved || 0);
  const bonusText = String(Math.round(Number(balance) || 0));

  const langLabel = language === 'uz' ? "O'zbekcha" : language === 'ru' ? 'Русский' : 'English';

  const infoRows: MenuRow[] = [
    {
      key: 'cashback',
      label: 'Cashback',
      value: cashbackText,
      icon: { kind: 'mci', name: 'wallet-outline', color: '#7C3AED', bg: '#F3E8FF' },
      onPress: () => router.push('/(tabs)/cashback'),
    },
    {
      key: 'level',
      label: 'Daraja',
      value: levelFull,
      icon: { kind: 'mci', name: 'crown-outline', color: GOLD, bg: '#FFF7E6' },
      onPress: () => router.push('/(tabs)/cashback'),
    },
    {
      key: 'branches',
      label: 'Dorixonalar',
      icon: { kind: 'feather', name: 'map-pin', color: '#7C3AED', bg: '#F3E8FF' },
      onPress: () => router.push('/branches'),
    },
    {
      key: 'rating',
      label: 'Xizmatni baholash',
      icon: { kind: 'mci', name: 'star-box-outline', color: '#7C3AED', bg: '#F3E8FF' },
      onPress: () => router.push('/rating'),
    },
    {
      key: 'notif',
      label: 'Bildirishnomalar',
      icon: { kind: 'feather', name: 'bell', color: '#7C3AED', bg: '#F3E8FF' },
      onPress: () => router.push('/notifications'),
    },
    {
      key: 'help',
      label: 'Yordam markazi',
      icon: { kind: 'feather', name: 'help-circle', color: '#7C3AED', bg: '#F3E8FF' },
      onPress: () => router.push('/help'),
    },
    {
      key: 'about',
      label: 'Ilova haqida',
      icon: { kind: 'feather', name: 'info', color: '#7C3AED', bg: '#F3E8FF' },
      onPress: () => router.push('/about'),
    },
  ];

  const onEdit = () => {
    router.push('/edit-profile');
  };

  const onLogout = () => {
    Alert.alert('Chiqish', 'Hisobdan chiqishni xohlaysizmi?', [
      { text: 'Bekor', style: 'cancel' },
      {
        text: 'Chiqish',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/welcome');
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Profil</Text>
            <Text style={styles.subtitle}>Shaxsiy ma’lumotlaringiz va sozlamalar</Text>
          </View>
          <Pressable style={styles.langBadge} onPress={() => router.push('/language')}>
            <Text style={styles.flag}>🇺🇿</Text>
            <Text style={styles.langCode}>{language.toUpperCase()}</Text>
            <Feather name="chevron-down" size={14} color={PURPLE} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#7B2FF2', '#5B1FD1', '#4C1D95']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroTop}
          >
            <View style={styles.heroWaveA} />
            <View style={styles.heroWaveB} />

            <View style={styles.heroRow}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarLetter}>{initial}</Text>
                </View>
                <Pressable style={styles.cameraBtn} onPress={onEdit} hitSlop={8}>
                  <Feather name="camera" size={12} color={PURPLE} />
                </Pressable>
              </View>

              <View style={styles.heroInfo}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {user.name || 'Mijoz'}
                </Text>
                <Text style={styles.heroPhone}>{formatPhone(user.phone)}</Text>
                <View style={styles.goldChip}>
                  <MaterialCommunityIcons name="crown" size={12} color={GOLD} />
                  <Text style={styles.goldChipText}>{levelFull}</Text>
                </View>
              </View>

              <Pressable style={styles.editBtn} onPress={onEdit}>
                <Feather name="edit-2" size={12} color="#FFFFFF" />
                <Text style={styles.editBtnText}>Profilni tahrirlash</Text>
              </Pressable>
            </View>
          </LinearGradient>

          <View style={styles.statsBar}>
            <Pressable style={styles.statCell} onPress={() => router.push('/(tabs)/cashback')}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={PURPLE} />
              <Text style={styles.statValue} numberOfLines={1}>
                {cashbackText}
              </Text>
              <Text style={styles.statLabel}>Cashback</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statCell} onPress={() => router.push('/(tabs)/cashback')}>
              <MaterialCommunityIcons name="star-circle" size={18} color={GOLD} />
              <Text style={styles.statValue} numberOfLines={1}>
                {levelName}
              </Text>
              <Text style={styles.statLabel}>Mening darajam</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statCell} onPress={() => router.push('/(tabs)/cashback')}>
              <MaterialCommunityIcons name="wallet-outline" size={18} color={PURPLE} />
              <Text style={styles.statValue} numberOfLines={1}>
                {bonusText}
              </Text>
              <Text style={styles.statLabel}>Mavjud balans</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Profil ma’lumotlari</Text>
          <Text style={styles.sectionAction}>Hisobingizni boshqaring</Text>
        </View>
        <View style={styles.card}>
          {infoRows.map((row, i) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              style={({ pressed }) => [
                styles.row,
                i < infoRows.length - 1 && styles.rowBorder,
                pressed && { opacity: 0.7 },
              ]}
            >
              <MenuIconBox icon={row.icon} />
              <Text style={styles.rowLabel}>{row.label}</Text>
              {row.value ? <Text style={styles.rowValue}>{row.value}</Text> : null}
              <Feather name="chevron-right" size={18} color="#C5CAD6" />
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Sozlamalar</Text>
          <Text style={styles.sectionAction}>Ilova sozlamalari</Text>
        </View>
        <View style={styles.card}>
          <Pressable
            onPress={() => router.push('/language')}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <MenuIconBox icon={{ kind: 'feather', name: 'globe', color: '#7C3AED', bg: '#F3E8FF' }} />
            <Text style={styles.rowLabel}>Til</Text>
            <Text style={styles.rowValue}>{langLabel}</Text>
            <Feather name="chevron-right" size={18} color="#C5CAD6" />
          </Pressable>
        </View>

        <Pressable onPress={onLogout} style={styles.logout}>
          <Feather name="log-out" size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Chiqish</Text>
        </Pressable>
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
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: PURPLE_DEEP,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ECEEF5',
  },
  flag: { fontSize: 14 },
  langCode: { fontSize: 12, fontWeight: '700', color: PURPLE_DEEP },

  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: CARD,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroTop: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    minHeight: 132,
    overflow: 'hidden',
  },
  heroWaveA: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -50,
    right: -40,
  },
  heroWaveB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.08)',
    bottom: -30,
    left: -20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 64,
    height: 64,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1040',
  },
  cameraBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0E9FF',
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  heroPhone: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  goldChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 236, 179, 0.92)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  goldChipText: {
    color: '#8A6A1A',
    fontSize: 11,
    fontWeight: '700',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 118,
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  },

  statsBar: {
    flexDirection: 'row',
    backgroundColor: CARD,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#EEF0F6',
    marginVertical: 4,
  },
  statValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    color: PURPLE_DEEP,
  },
  statLabel: {
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
  },

  sectionHead: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: PURPLE_DEEP,
  },
  sectionAction: {
    fontSize: 11,
    color: MUTED,
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEF0F6',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF0F6',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: PURPLE_DEEP,
  },
  rowValue: {
    fontSize: 12,
    color: MUTED,
    marginRight: 2,
  },

  logout: {
    marginTop: 22,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
  },
});
