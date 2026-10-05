import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { LanguageBadge } from '@/components/LanguageBadge';
import { CrownIcon, WalletIcon } from '@/components/LineIcons';
import type { Language } from '@/lib/languages';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { buildProfileSummary, EMPTY_VALUE, matchTierRate } from '@/lib/profileSummary';

// Brand palette; the remaining tones below are fixed tints or reduced-opacity variants of it.
const PRIMARY = '#4B248A';
const DEEP = '#351765';
const PURPLE_LIGHT = '#F1EBFF';
const SOFT = '#F8F5FF';
const YELLOW = '#FFD233';
const BG = '#F7F7F5';
const SURFACE = '#FFFFFF';
const INK = '#17162C';
const SECONDARY = '#6B7280';
const DANGER = '#DC2626';

const MUTED = 'rgba(107,114,128,0.55)';
const HAIRLINE = 'rgba(23,22,44,0.05)';
const DIVIDER = '#EDEAF3';
const EDIT_BG = '#F7F3FF';
const EDIT_EDGE = '#E9E2F5';
const DANGER_EDGE = 'rgba(220,38,38,0.14)';
const DANGER_TINT = 'rgba(220,38,38,0.07)';

const SHADOW_CONTROL = '0px 1px 2px rgba(23,22,44,0.04), 0px 4px 12px rgba(53,23,101,0.06)';
const SHADOW_GROUP = '0px 1px 2px rgba(23,22,44,0.03), 0px 6px 20px rgba(53,23,101,0.04)';

type IconName = React.ComponentProps<typeof Feather>['name'];

function MenuRow({
  icon,
  title,
  value,
  a11y,
  onPress,
  testID,
  accent,
  last,
}: {
  icon: IconName | 'wallet';
  title: string;
  value?: string;
  a11y: string;
  onPress: () => void;
  testID: string;
  accent?: boolean;
  last?: boolean;
}) {
  const color = accent ? DEEP : PRIMARY;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, accent && styles.rowIconAccent]} importantForAccessibility="no-hide-descendants">
        {icon === 'wallet' ? <WalletIcon size={19} color={color} strokeWidth={2} /> : <Feather name={icon} size={19} color={color} />}
      </View>
      <View style={[styles.rowBody, !last && styles.divider]}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {value && value !== EMPTY_VALUE ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <Feather name="chevron-right" size={16} color={MUTED} importantForAccessibility="no" />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, language, balance, logout, refresh, loading, isAuthenticated, t, fmt } = useApp();
  const [tierRate, setTierRate] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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
          if (alive) setTierRate(matchTierRate(rules?.tiers, user?.tier));
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
  const summary = buildProfileSummary(
    {
      ready,
      name: user.name,
      phone: user.phone,
      tier: user.tier,
      purchases: user.purchases,
      balance,
      tierRate,
    },
    { money: fmt.money, number: fmt.number, currency: t('common.currency') },
  );

  const onEdit = () => router.push('/edit-profile');
  const onCashback = () => router.push('/cashback');
  const onTier = () => router.push({ pathname: '/cashback', params: { focus: 'tier' } });
  const onNotifications = () => router.push('/notifications');

  const onLogout = async () => {
    if (loggingOut) return;
    const ok = await confirmAction({
      title: t('common.logoutTitle'),
      message: t('common.logoutConfirm'),
      confirmText: t('common.logout'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
    if (router.canDismiss()) router.dismissAll();
    router.replace('/welcome');
  };

  const tabClearance = Platform.OS === 'web' ? 96 : 80;
  const bottomPad = 16 + Math.max(insets.bottom, 8) + tabClearance;
  const topPad = Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) + 4;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[SOFT, BG]} locations={[0, 1]} style={styles.atmosphere} pointerEvents="none" />

        <View style={styles.topBar}>
          <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
            {t('common.navProfile')}
          </Text>
          <View style={styles.topActions}>
            <LanguageBadge language={language as Language} onPress={() => router.push('/language')} />
            <Pressable
              onPress={onNotifications}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t('profile.notificationsA11y')}
              testID="profile-bell"
              style={({ pressed }) => [styles.bell, pressed && styles.controlPressed]}
            >
              <Feather name="bell" size={18} color={PRIMARY} />
            </Pressable>
          </View>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.identity}>
            <View style={styles.avatar} accessible accessibilityRole="image" accessibilityLabel={t('profile.avatarA11y')}>
              <LinearGradient colors={[PRIMARY, DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFill}>
                <Text style={styles.avatarLetter}>{summary.initial}</Text>
              </LinearGradient>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={2}>
                {summary.displayName}
              </Text>
              <Text style={styles.phone} numberOfLines={1}>
                {summary.phone}
              </Text>
            </View>
          </View>

          <View style={styles.memberRow}>
            <Pressable
              onPress={onTier}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={summary.hasTier ? t('profile.tierA11y', { tier: summary.tier }) : t('profile.tierA11yNone')}
              testID="profile-tier"
              style={({ pressed }) => [styles.chip, !summary.hasTier && styles.chipNone, pressed && styles.controlPressed]}
            >
              <View style={[styles.chipMedal, !summary.hasTier && styles.chipMedalNone]} importantForAccessibility="no-hide-descendants">
                <CrownIcon size={12} color={summary.hasTier ? YELLOW : SECONDARY} strokeWidth={2.2} />
              </View>
              <Text style={[styles.chipText, !summary.hasTier && styles.chipTextNone]} numberOfLines={1}>
                {summary.hasTier ? t('profile.memberStatus', { tier: summary.tier }) : t('profile.tierNone')}
              </Text>
              <Feather name="chevron-right" size={14} color={summary.hasTier ? PRIMARY : SECONDARY} />
            </Pressable>
            {summary.rate !== EMPTY_VALUE ? (
              <View style={styles.rate}>
                <View style={styles.rateDot} />
                <Text style={styles.rateText} numberOfLines={1}>
                  {t('profile.rateLine', { rate: summary.rate })}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={t('common.navEditProfile')}
            testID="profile-edit"
            style={({ pressed }) => [styles.edit, pressed && styles.editPressed]}
          >
            <Feather name="edit-3" size={17} color={PRIMARY} />
            <Text style={styles.editText} numberOfLines={1}>
              {t('common.navEditProfile')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.menu}>
          <MenuRow
            icon="wallet"
            accent
            title={t('common.navCashback')}
            value={summary.balance}
            a11y={t('profile.cashbackA11y', { balance: summary.balance })}
            onPress={onCashback}
            testID="profile-cashback"
          />
          <MenuRow
            icon="shopping-bag"
            title={t('common.navOrders')}
            a11y={t('profile.ordersA11y')}
            onPress={() => router.push('/(tabs)/purchases')}
            testID="profile-orders"
          />
          <MenuRow
            icon="map-pin"
            title={t('common.navBranches')}
            a11y={t('profile.branchesA11y')}
            onPress={() => router.push('/branches')}
            testID="profile-branches"
          />
          <MenuRow
            icon="bell"
            title={t('common.navNotifications')}
            a11y={t('common.navNotifications')}
            onPress={onNotifications}
            testID="profile-notifications"
          />
          <MenuRow
            icon="help-circle"
            title={t('common.navHelp')}
            a11y={t('profile.helpA11y')}
            onPress={() => router.push('/help')}
            testID="profile-help"
          />
          <MenuRow
            icon="star"
            title={t('common.navRating')}
            a11y={t('common.navRating')}
            onPress={() => router.push('/rating')}
            testID="profile-rating"
          />
          <MenuRow
            icon="info"
            title={t('common.navAbout')}
            a11y={t('common.navAbout')}
            onPress={() => router.push('/about')}
            testID="profile-about"
            last
          />
        </View>

        <Pressable
          onPress={() => void onLogout()}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel={t('common.logoutA11y')}
          accessibilityState={{ disabled: loggingOut, busy: loggingOut }}
          testID="profile-logout"
          style={({ pressed }) => [styles.logout, (pressed || loggingOut) && styles.logoutPressed]}
        >
          <View style={styles.logoutIcon} importantForAccessibility="no-hide-descendants">
            <Feather name="log-out" size={18} color={DANGER} />
          </View>
          <Text style={styles.logoutText} numberOfLines={1}>
            {loggingOut ? t('common.loggingOut') : t('common.logout')}
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
    paddingHorizontal: 20,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  atmosphere: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  controlPressed: { opacity: 0.8 },

  topBar: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topTitle: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 30, color: INK, letterSpacing: -0.6 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(75,36,138,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: SHADOW_CONTROL,
  },

  identityCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: HAIRLINE,
    boxShadow: SHADOW_GROUP,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: SURFACE,
    backgroundColor: PRIMARY,
    overflow: 'hidden',
    boxShadow: '0px 0px 0px 1px rgba(75,36,138,0.10), 0px 6px 14px rgba(53,23,101,0.18)',
  },
  avatarFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 26, color: SURFACE, textAlign: 'center' },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 31, color: INK, letterSpacing: -0.7 },
  phone: { marginTop: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: SECONDARY, letterSpacing: 0.2 },

  memberRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 32,
    paddingLeft: 5,
    paddingRight: 9,
    borderRadius: 16,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255,210,51,0.55)',
  },
  chipNone: { borderColor: HAIRLINE },
  chipMedal: { width: 22, height: 22, borderRadius: 11, backgroundColor: DEEP, alignItems: 'center', justifyContent: 'center' },
  chipMedalNone: { backgroundColor: PURPLE_LIGHT },
  chipText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 17, color: DEEP, letterSpacing: -0.1 },
  chipTextNone: { color: SECONDARY },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  rateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: YELLOW },
  rateText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 17, color: PRIMARY },

  edit: {
    marginTop: 14,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: EDIT_BG,
    borderWidth: 1,
    borderColor: EDIT_EDGE,
  },
  editPressed: { backgroundColor: PURPLE_LIGHT },
  editText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: DEEP },

  menu: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: HAIRLINE,
    overflow: 'hidden',
    boxShadow: SHADOW_GROUP,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 14 },
  rowPressed: { backgroundColor: SOFT },
  rowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center' },
  rowIconAccent: { backgroundColor: 'rgba(255,210,51,0.26)' },
  rowBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    marginRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  rowTitle: { flex: 1, minWidth: 0, fontFamily: 'Inter_500Medium', fontSize: 16, lineHeight: 22, color: INK, letterSpacing: -0.2 },
  rowValue: { flexShrink: 0, fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: SECONDARY },

  logout: {
    marginTop: 16,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: DANGER_EDGE,
  },
  logoutPressed: { backgroundColor: 'rgba(220,38,38,0.04)' },
  logoutIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: DANGER_TINT, alignItems: 'center', justifyContent: 'center' },
  logoutText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: DANGER },
});
