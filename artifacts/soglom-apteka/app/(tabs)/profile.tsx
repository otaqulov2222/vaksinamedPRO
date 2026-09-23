import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { formatUzs } from '@/components/AppUI';
import { LanguageBadge } from '@/components/LanguageBadge';
import { LanguageFlag } from '@/components/LanguageFlag';
import { getLanguageMeta } from '@/lib/languages';

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
  a11y: string;
  icon: MenuIcon;
  onPress: () => void;
};

type MenuSection = {
  key: string;
  title: string;
  rows: MenuRow[];
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

function MenuIconBox({ icon }: { icon: MenuIcon }) {
  return (
    <View style={[styles.iconBox, { backgroundColor: icon.bg }]} importantForAccessibility="no-hide-descendants">
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
  const { width } = useWindowDimensions();
  const narrow = width < 390;
  const { user, language, balance, logout, refresh, loading, isAuthenticated } = useApp();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          await refresh();
        } catch {
          // Context refresh already handles auth failures; ignore for focus.
        }
        if (!alive) return;
      })();
      return () => {
        alive = false;
      };
    }, [refresh]),
  );

  const ready = isAuthenticated && !loading;

  const initial = useMemo(() => {
    const n = String(user.name || '').trim();
    return n ? n[0].toUpperCase() : '—';
  }, [user.name]);

  // API: balance = spendable cashback (getAuthoritativeBalance). Not savedAmount.
  const balanceText = ready
    ? formatUzs(Math.max(0, Math.floor(Number(balance) || 0)))
    : '—';

  // API: tier from customer.tier — never invent Silver/Gold in UI.
  const tierRaw = String(user.tier || '').trim();
  const hasTier = Boolean(tierRaw);
  const levelName = hasTier ? tierRaw : '';
  const levelFull = hasTier ? `${tierRaw} daraja` : 'Daraja mavjud emas';

  // API: purchasesCount — real counter; 0 is valid once profile is ready.
  const purchasesText = ready
    ? String(Math.max(0, Math.floor(Number(user.purchases) || 0)))
    : '—';

  const langMeta = getLanguageMeta(language);
  const displayName = String(user.name || '').trim() || '—';

  const sections: MenuSection[] = [
    {
      key: 'account',
      title: 'Hisob',
      rows: [
        {
          key: 'edit',
          label: 'Profilni tahrirlash',
          a11y: 'Profilni tahrirlash',
          icon: { kind: 'feather', name: 'edit-2', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/edit-profile'),
        },
        {
          key: 'language',
          label: 'Til',
          value: langMeta.shortCode,
          a11y: `Til: ${langMeta.nativeName}`,
          icon: { kind: 'feather', name: 'globe', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/language'),
        },
      ],
    },
    {
      key: 'loyalty',
      title: 'Cashback va daraja',
      rows: [
        {
          key: 'cashback',
          // Same spendable balance as top "Mavjud balans" — not savedAmount.
          label: 'Mavjud balans',
          value: balanceText,
          a11y: `Mavjud cashback balansini ko‘rish, ${balanceText}`,
          icon: { kind: 'mci', name: 'wallet-outline', color: '#7C3AED', bg: '#F3E8FF' },
          // Stack child — not a tab switch (NAV 2).
          onPress: () => router.push('/cashback'),
        },
        {
          key: 'level',
          label: 'Daraja',
          value: levelFull,
          a11y: `Darajani ko‘rish, ${levelFull}`,
          icon: { kind: 'mci', name: 'crown-outline', color: GOLD, bg: '#FFF7E6' },
          // No separate loyalty screen — Cashback stack shows tier cards; Back → Profile.
          onPress: () => router.push({ pathname: '/cashback', params: { focus: 'tier' } }),
        },
      ],
    },
    {
      key: 'orders',
      title: 'Buyurtmalar',
      rows: [
        {
          key: 'purchases',
          label: 'Buyurtmalar',
          value: ready ? purchasesText : undefined,
          a11y: 'Buyurtmalar',
          icon: { kind: 'feather', name: 'shopping-bag', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/(tabs)/purchases'),
        },
      ],
    },
    {
      key: 'support',
      title: 'Yordam',
      rows: [
        {
          key: 'notif',
          label: 'Bildirishnomalar',
          a11y: 'Bildirishnomalar',
          icon: { kind: 'feather', name: 'bell', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/notifications'),
        },
        {
          key: 'help',
          label: 'Yordam markazi',
          a11y: 'Yordam markazi',
          icon: { kind: 'feather', name: 'help-circle', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/help'),
        },
        {
          key: 'branches',
          label: 'Dorixonalar',
          a11y: 'Dorixonalar',
          icon: { kind: 'feather', name: 'map-pin', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/branches'),
        },
        {
          key: 'rating',
          label: 'Xizmatni baholash',
          a11y: 'Xizmatni baholash',
          icon: { kind: 'mci', name: 'star-box-outline', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/rating'),
        },
      ],
    },
    {
      key: 'about',
      title: 'Ilova',
      rows: [
        {
          key: 'about',
          label: 'Ilova haqida',
          a11y: 'Ilova haqida',
          icon: { kind: 'feather', name: 'info', color: '#7C3AED', bg: '#F3E8FF' },
          onPress: () => router.push('/about'),
        },
      ],
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

  const tabClearance = Platform.OS === 'web' ? 88 : 72;
  const bottomPad = 24 + Math.max(insets.bottom, 8) + tabClearance;

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Profil</Text>
            <Text style={styles.subtitle}>Shaxsiy ma’lumotlaringiz va sozlamalar</Text>
          </View>
          <LanguageBadge language={language} onPress={() => router.push('/language')} />
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#7B2FF2', '#5B1FD1', '#4C1D95']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroTop}
          >
            <View style={styles.heroWaveA} pointerEvents="none" />
            <View style={styles.heroWaveB} pointerEvents="none" />

            <View style={[styles.heroRow, narrow && styles.heroRowNarrow]}>
              <View style={styles.avatar} accessible accessibilityLabel="Profil avatari" accessibilityRole="image">
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>

              <View style={styles.heroInfo}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {displayName}
                </Text>
                <Text style={styles.heroPhone} numberOfLines={1}>
                  {formatPhone(user.phone)}
                </Text>
                {hasTier ? (
                  <View style={styles.goldChip}>
                    <MaterialCommunityIcons name="crown" size={12} color={GOLD} />
                    <Text style={styles.goldChipText} numberOfLines={1}>
                      {levelFull}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.tierMissing}>{levelFull}</Text>
                )}
              </View>

              {!narrow ? (
                <Pressable
                  style={styles.editBtn}
                  onPress={onEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Profilni tahrirlash"
                >
                  <Feather name="edit-2" size={13} color="#FFFFFF" />
                  <Text style={styles.editBtnText}>Tahrirlash</Text>
                </Pressable>
              ) : null}
            </View>

            {narrow ? (
              <Pressable
                style={styles.editBtnWide}
                onPress={onEdit}
                accessibilityRole="button"
                accessibilityLabel="Profilni tahrirlash"
              >
                <Feather name="edit-2" size={14} color="#FFFFFF" />
                <Text style={styles.editBtnWideText}>Profilni tahrirlash</Text>
              </Pressable>
            ) : null}
          </LinearGradient>

          <View style={styles.statsBar}>
            <Pressable
              style={styles.statCell}
              onPress={() => router.push('/cashback')}
              accessibilityRole="button"
              accessibilityLabel={`Mavjud balans, ${balanceText}`}
            >
              <MaterialCommunityIcons name="wallet-outline" size={18} color={PURPLE} />
              <Text
                style={styles.statValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {balanceText}
              </Text>
              <Text style={styles.statLabel}>Mavjud balans</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable
              style={styles.statCell}
              onPress={() => router.push({ pathname: '/cashback', params: { focus: 'tier' } })}
              accessibilityRole="button"
              accessibilityLabel={`Daraja, ${levelFull}`}
            >
              <MaterialCommunityIcons name="star-circle" size={18} color={GOLD} />
              <Text style={styles.statValue} numberOfLines={1}>
                {hasTier ? levelName : '—'}
              </Text>
              <Text style={styles.statLabel}>Daraja</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable
              style={styles.statCell}
              onPress={() => router.push('/(tabs)/purchases')}
              accessibilityRole="button"
              accessibilityLabel={`Xaridlar, ${purchasesText}`}
            >
              <MaterialCommunityIcons name="shopping-outline" size={18} color={PURPLE} />
              <Text style={styles.statValue} numberOfLines={1}>
                {purchasesText}
              </Text>
              <Text style={styles.statLabel}>Xaridlar</Text>
            </Pressable>
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.key}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.card}>
              {section.rows.map((row, i) => (
                <Pressable
                  key={row.key}
                  onPress={row.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={row.a11y}
                  style={({ pressed }) => [
                    styles.row,
                    i < section.rows.length - 1 && styles.rowBorder,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <MenuIconBox icon={row.icon} />
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.key === 'language' ? (
                    <View style={styles.langRowValue}>
                      <LanguageFlag language={language} size={14} />
                      <Text style={styles.rowValue} numberOfLines={1}>
                        {langMeta.shortCode}
                      </Text>
                    </View>
                  ) : row.value ? (
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {row.value}
                    </Text>
                  ) : null}
                  <Feather name="chevron-right" size={18} color="#C5CAD6" />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          onPress={onLogout}
          style={styles.logout}
          accessibilityRole="button"
          accessibilityLabel="Chiqish"
        >
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
    paddingBottom: 18,
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
  heroRowNarrow: {
    alignItems: 'flex-start',
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
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  heroPhone: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  tierMissing: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
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
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  editBtnWide: {
    marginTop: 14,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editBtnWideText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    minWidth: 0,
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
    textAlign: 'center',
    maxWidth: '100%',
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
    textAlign: 'center',
  },

  sectionHead: {
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: PURPLE_DEEP,
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
    maxWidth: '42%',
    textAlign: 'right',
  },
  langRowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
