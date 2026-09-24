import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { getLanguageMeta, type Language } from '@/lib/languages';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_MID = '#5B1FD1';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F3F1F7';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const GOLD = '#C9A227';
const GOLD_SOFT = '#FFF8E8';

type RowIcon =
  | { kind: 'feather'; name: React.ComponentProps<typeof Feather>['name'] }
  | { kind: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

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

function IconTile({
  icon,
  tone = 'lavender',
  size = 'sm',
}: {
  icon: RowIcon;
  tone?: 'lavender' | 'gold';
  size?: 'sm' | 'md';
}) {
  const bg = tone === 'gold' ? GOLD_SOFT : LAVENDER;
  const color = tone === 'gold' ? GOLD : PURPLE;
  const box = size === 'md' ? 40 : 32;
  const iconSize = size === 'md' ? 18 : 15;
  return (
    <View
      style={[styles.iconTile, { width: box, height: box, borderRadius: size === 'md' ? 12 : 9, backgroundColor: bg }]}
      importantForAccessibility="no-hide-descendants"
    >
      {icon.kind === 'feather' ? (
        <Feather name={icon.name} size={iconSize} color={color} />
      ) : (
        <MaterialCommunityIcons name={icon.name} size={iconSize + 1} color={color} />
      )}
    </View>
  );
}

function UtilityRow({
  icon,
  title,
  subtitle,
  a11y,
  onPress,
  trailing,
  last,
}: {
  icon: RowIcon;
  title: string;
  subtitle?: string;
  a11y: string;
  onPress: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.utilRow, !last && styles.utilRowBorder, pressed && styles.pressedSoft]}
    >
      <IconTile icon={icon} />
      <View style={styles.utilText}>
        <Text style={styles.utilTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.utilSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      <Feather name="chevron-right" size={15} color="#C5CAD6" importantForAccessibility="no" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < 390;
  const { user, language, balance, logout, refresh, loading, isAuthenticated } = useApp();
  const [tierRate, setTierRate] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          await refresh();
        } catch {
          // Auth failures handled in context.
        }
        if (!alive) return;
        try {
          const rules = await api.cashbackRules();
          if (!alive) return;
          const tiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
          const userTier = String(user?.tier || '').toLowerCase();
          const match = tiers.find((t: any) => {
            const label = String(t?.tier || '').toLowerCase();
            if (!userTier || !label) return false;
            return (
              label === userTier ||
              label.includes(userTier) ||
              userTier.includes(label.replace(/\s+daraja$/, ''))
            );
          });
          const rate = match?.rate != null ? String(match.rate).trim() : '';
          setTierRate(rate || null);
        } catch {
          if (alive) setTierRate(null);
        }
      })();
      return () => {
        alive = false;
      };
    }, [refresh, user?.tier]),
  );

  const ready = isAuthenticated && !loading;
  const langMeta = getLanguageMeta(language);

  const initial = useMemo(() => {
    const n = String(user.name || '').trim();
    return n ? n[0].toUpperCase() : '—';
  }, [user.name]);

  const balanceText = ready
    ? formatUzs(Math.max(0, Math.floor(Number(balance) || 0)))
    : '—';

  const tierRaw = String(user.tier || '').trim();
  const hasTier = Boolean(tierRaw);
  const tierLabel = hasTier ? tierRaw : '—';

  const purchasesCount = ready ? Math.max(0, Math.floor(Number(user.purchases) || 0)) : null;
  const purchasesText = purchasesCount == null ? '—' : String(purchasesCount);

  const displayName = String(user.name || '').trim() || '—';
  const phoneText = formatPhone(user.phone);

  const onEdit = () => router.push('/edit-profile');
  const onCashback = () => router.push('/cashback');
  const onTier = () => router.push({ pathname: '/cashback', params: { focus: 'tier' } });

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

  const tabClearance = Platform.OS === 'web' ? 96 : 80;
  const bottomPad = 32 + Math.max(insets.bottom, 8) + tabClearance;
  const tierSub = tierRate ? `Sizning darajangiz · ${tierRate}` : 'Sizning darajangiz';

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.pageTitle}>Profil</Text>
            <Text style={styles.pageSubtitle}>VaksinaMed — mening shaxsiy kabinetim</Text>
          </View>
          <LanguageBadge language={language as Language} onPress={() => router.push('/language')} />
        </View>

        {/* 2. Premium identity hero */}
        <LinearGradient
          colors={['#6E28E0', PURPLE_MID, '#3B1580']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroDecorA} pointerEvents="none" />
          <View style={styles.heroDecorB} pointerEvents="none" />

          <View style={[styles.heroTop, narrow && styles.heroTopNarrow]}>
            <View
              style={styles.avatar}
              accessible
              accessibilityRole="image"
              accessibilityLabel="Profil avatari"
            >
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>

            <View style={styles.heroIdentity}>
              <Text style={styles.heroName} numberOfLines={2}>
                {displayName}
              </Text>
              <Text style={styles.heroPhone} numberOfLines={1}>
                {phoneText}
              </Text>
              {hasTier ? (
                <View style={styles.tierBadge} importantForAccessibility="no-hide-descendants">
                  <MaterialCommunityIcons name="crown" size={11} color={GOLD} />
                  <Text style={styles.tierBadgeText} numberOfLines={1}>
                    {tierLabel}
                  </Text>
                </View>
              ) : ready ? (
                <Text style={styles.tierAbsent}>Daraja mavjud emas</Text>
              ) : null}
            </View>

            {!narrow ? (
              <Pressable
                style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.85 }]}
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
              style={({ pressed }) => [styles.editWide, pressed && { opacity: 0.85 }]}
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel="Profilni tahrirlash"
            >
              <Feather name="edit-2" size={13} color="#FFFFFF" />
              <Text style={styles.editWideText}>Tahrirlash</Text>
            </Pressable>
          ) : null}

          <View
            style={styles.metrics}
            accessible
            accessibilityLabel={`Cashback ${balanceText}, Daraja ${tierLabel}, Xaridlar ${purchasesText}`}
          >
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Cashback</Text>
              <Text
                style={styles.metricValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {balanceText}
              </Text>
            </View>
            <View style={styles.metricRule} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Daraja</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {tierLabel}
              </Text>
            </View>
            <View style={styles.metricRule} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Xaridlar</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {purchasesText}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* 3. Dominant loyalty feature */}
        <Text style={[styles.sectionHeading, styles.sectionAfterHero]}>Sodiqlik dasturi</Text>
        <View style={styles.loyaltyCard}>
          <Pressable
            onPress={onCashback}
            accessibilityRole="button"
            accessibilityLabel={`Cashbackni ko‘rish, ${balanceText}`}
            style={({ pressed }) => [styles.loyaltyMain, pressed && styles.pressedSoft]}
          >
            <View style={styles.loyaltyBadge} importantForAccessibility="no-hide-descendants">
              <Text style={styles.loyaltyBadgeText}>Cashback</Text>
            </View>
            <Text
              style={styles.loyaltyAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {balanceText}
            </Text>
            <Text style={styles.loyaltyHint}>Yagona balans · barcha xarid kanallari</Text>
            <View style={styles.loyaltyCtaRow} importantForAccessibility="no-hide-descendants">
              <Text style={styles.loyaltyCtaText}>Batafsil</Text>
              <Feather name="arrow-right" size={14} color={PURPLE} />
            </View>
          </Pressable>

          <Pressable
            onPress={onTier}
            accessibilityRole="button"
            accessibilityLabel={`Darajani ko‘rish, ${hasTier ? tierLabel : 'mavjud emas'}`}
            style={({ pressed }) => [styles.loyaltyTierRow, pressed && styles.pressedSoft]}
          >
            <View style={styles.loyaltyTierIcon} importantForAccessibility="no-hide-descendants">
              <MaterialCommunityIcons name="crown" size={16} color={GOLD} />
            </View>
            <View style={styles.loyaltyTierCopy}>
              <Text style={styles.loyaltyTierTitle} numberOfLines={1}>
                {hasTier ? tierLabel : 'Daraja'}
              </Text>
              <Text style={styles.loyaltyTierSub} numberOfLines={1}>
                {hasTier ? tierSub : 'Daraja mavjud emas'}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color="#C5CAD6" importantForAccessibility="no" />
          </Pressable>
        </View>

        {/* 4. Account shortcuts — subordinate */}
        <Text style={styles.sectionHeading}>Hisob</Text>
        <View style={styles.panel}>
          <UtilityRow
            icon={{ kind: 'feather', name: 'edit-2' }}
            title="Profilni tahrirlash"
            subtitle="Shaxsiy ma’lumotlar"
            a11y="Profilni tahrirlash"
            onPress={onEdit}
          />
          <UtilityRow
            icon={{ kind: 'feather', name: 'globe' }}
            title="Til"
            subtitle={langMeta.nativeName}
            a11y={`Tilni o‘zgartirish, ${langMeta.nativeName}`}
            onPress={() => router.push('/language')}
            trailing={
              <View style={styles.langTrail} importantForAccessibility="no-hide-descendants">
                <LanguageFlag language={language as Language} size={14} />
                <Text style={styles.langCode}>{langMeta.shortCode}</Text>
              </View>
            }
            last
          />
        </View>

        {/* 5. App orders shortcut — not the universal purchase counter */}
        <Text style={styles.sectionHeading}>Buyurtmalar</Text>
        <Pressable
          onPress={() => router.push('/(tabs)/purchases')}
          accessibilityRole="button"
          accessibilityLabel="Ilova buyurtmalarini ko‘rish"
          style={({ pressed }) => [styles.ordersCard, pressed && styles.pressedSoft]}
        >
          <IconTile icon={{ kind: 'feather', name: 'shopping-bag' }} size="md" />
          <View style={styles.ordersText}>
            <Text style={styles.ordersTitle}>Buyurtmalar</Text>
            <Text style={styles.ordersSub}>Ilova buyurtmalari</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#B8BECB" importantForAccessibility="no" />
        </Pressable>

        {/* 6. Help & services — compact */}
        <Text style={styles.sectionHeading}>Yordam va xizmatlar</Text>
        <View style={styles.panel}>
          <UtilityRow
            icon={{ kind: 'feather', name: 'bell' }}
            title="Bildirishnomalar"
            a11y="Bildirishnomalarni ko‘rish"
            onPress={() => router.push('/notifications')}
          />
          <UtilityRow
            icon={{ kind: 'feather', name: 'help-circle' }}
            title="Yordam markazi"
            a11y="Yordam markazini ochish"
            onPress={() => router.push('/help')}
          />
          <UtilityRow
            icon={{ kind: 'feather', name: 'map-pin' }}
            title="Dorixonalar"
            a11y="Dorixonalarni ko‘rish"
            onPress={() => router.push('/branches')}
          />
          <UtilityRow
            icon={{ kind: 'mci', name: 'star-box-outline' }}
            title="Xizmatni baholash"
            a11y="Xizmatni baholash"
            onPress={() => router.push('/rating')}
            last
          />
        </View>

        {/* 7. App — quiet */}
        <Text style={styles.sectionHeading}>Ilova</Text>
        <View style={[styles.panel, styles.panelQuiet]}>
          <UtilityRow
            icon={{ kind: 'feather', name: 'info' }}
            title="Ilova haqida"
            a11y="Ilova haqida"
            onPress={() => router.push('/about')}
            last
          />
        </View>

        {/* 8. Logout */}
        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [styles.logout, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel="Tizimdan chiqish"
        >
          <Feather name="log-out" size={16} color="#DC2626" />
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
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  headerText: { flex: 1, minWidth: 0 },
  pageTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: PURPLE_DEEP,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
  },

  hero: {
    borderRadius: 22,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 2,
    overflow: 'hidden',
    marginBottom: 0,
  },
  heroDecorA: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -44,
    right: -32,
  },
  heroDecorB: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.08)',
    bottom: 20,
    left: -24,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTopNarrow: {
    alignItems: 'flex-start',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    lineHeight: 24,
    color: PURPLE_DEEP,
  },
  heroIdentity: { flex: 1, minWidth: 0 },
  heroName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    lineHeight: 24,
    color: '#FFFFFF',
  },
  heroPhone: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.78)',
  },
  tierBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 236, 179, 0.92)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tierBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
    color: '#8A6A1A',
  },
  tierAbsent: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.65)',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
  },
  editBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
    color: '#FFFFFF',
  },
  editWide: {
    marginTop: 12,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editWideText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
    color: '#FFFFFF',
  },

  metrics: {
    marginTop: 12,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingTop: 8,
    paddingBottom: 10,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
    gap: 1,
  },
  metricRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginVertical: 1,
  },
  metricLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    lineHeight: 13,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  metricValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    maxWidth: '100%',
  },

  sectionHeading: {
    marginTop: 22,
    marginBottom: 10,
    marginLeft: 2,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  sectionAfterHero: {
    marginTop: 22,
  },

  loyaltyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 0,
    overflow: 'hidden',
    shadowColor: '#1A1040',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  loyaltyMain: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  loyaltyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: LAVENDER,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 10,
  },
  loyaltyBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
    color: PURPLE,
  },
  loyaltyAmount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: PURPLE_DEEP,
    letterSpacing: -0.5,
  },
  loyaltyHint: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
  },
  loyaltyCtaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  loyaltyCtaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: PURPLE,
  },
  loyaltyTierRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FAF8FC',
  },
  loyaltyTierIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GOLD_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyTierCopy: { flex: 1, minWidth: 0, gap: 2 },
  loyaltyTierTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  loyaltyTierSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },

  panel: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginBottom: 0,
  },
  panelQuiet: {
    opacity: 0.96,
  },
  utilRow: {
    minHeight: 50,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  utilRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  utilText: { flex: 1, minWidth: 0, gap: 1 },
  utilTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
  },
  utilSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  iconTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  langTrail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: 2,
  },
  langCode: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },

  ordersCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 0,
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  ordersText: { flex: 1, minWidth: 0, gap: 2 },
  ordersTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
  },
  ordersSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },

  logout: {
    marginTop: 22,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  logoutText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
    color: '#DC2626',
  },

  pressedSoft: { opacity: 0.92 },
});
