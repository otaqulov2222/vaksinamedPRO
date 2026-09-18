import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { ActionTile, IconButton, ProgressLine, Screen, SectionTitle, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors();
  const { t, balance, user } = useApp();
  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{t('hello')}</Text>
          <Text style={[styles.name, { color: colors.foreground }]}>{user.name.split(' ')[0]} <Text style={{ color: colors.primary }}>•</Text></Text>
        </View>
        <IconButton icon="bell" badge onPress={() => router.push('/profile')} />
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={styles.heroBrand}>
          <View style={styles.leafCircle}><MaterialCommunityIcons name="leaf" size={24} color={colors.primary} /></View>
          <View><Text style={styles.brandName}>Sog‘lom</Text><Text style={styles.brandSub}>APTEKA TARMOғI</Text></View>
        </View>
        <View>
          <Text style={styles.heroTitle}>{t('welcome')}</Text>
          <Text style={styles.heroCaption}>Sodiqlik dasturidagi imtiyozlardan foydalaning</Text>
        </View>
        <View style={styles.heroDecoration}><MaterialCommunityIcons name="gift-outline" size={58} color="rgba(255,255,255,0.28)" /></View>
      </View>

      <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.balanceTop}>
          <View><Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>{t('balance')}</Text><Text style={[styles.balance, { color: colors.foreground }]}>{formatUzs(balance)}</Text></View>
          <View style={[styles.coin, { backgroundColor: '#fff1c9' }]}><MaterialCommunityIcons name="star-four-points" size={22} color="#e3a816" /></View>
        </View>
        <View style={styles.tierRow}><View style={[styles.tierIcon, { backgroundColor: '#efe1d5' }]}><MaterialCommunityIcons name="medal-outline" size={16} color="#956331" /></View><Text style={[styles.tier, { color: colors.foreground }]}>{t('gold')}</Text><Text style={[styles.tierHint, { color: colors.mutedForeground }]}>• 150 000 so‘m</Text></View>
        <ProgressLine progress={balance / 150000} />
        <Text style={[styles.progressCaption, { color: colors.mutedForeground }]}>{t('nextLevel')}: {formatUzs(Math.max(0, 150000 - balance))}</Text>
        <View style={styles.balanceActions}>
          <Pressable onPress={() => router.push('/qr')} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}><Feather name="maximize" size={16} color={colors.primaryForeground} /><Text style={styles.primaryButtonText}>{t('spend')}</Text></Pressable>
          <Pressable onPress={() => router.push('/cashback')} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.secondaryButtonText, { color: colors.secondaryForeground }]}>{t('history')}</Text><Feather name="arrow-up-right" size={17} color={colors.secondaryForeground} /></Pressable>
        </View>
      </View>

      <SectionTitle title={t('quickAccess')} />
      <View style={styles.actionRow}>
        <ActionTile icon="qrcode-scan" label={t('myQr')} onPress={() => router.push('/qr')} />
        <ActionTile icon="map-marker-outline" label={t('branches')} tint="mint" onPress={() => router.push('/branches')} />
        <ActionTile icon="sale" label={t('offers')} tint="gold" onPress={() => router.push('/promos')} />
        <ActionTile icon="account-multiple-plus-outline" label={t('invite')} tint="pink" onPress={() => router.push('/profile')} />
      </View>

      <View style={[styles.promoCard, { backgroundColor: '#e3f5ea' }]}>
        <View style={styles.promoCopy}><Text style={[styles.promoTitle, { color: '#165c47' }]}>Sodiq mijozlarga</Text><Text style={[styles.promoTitle, { color: '#165c47' }]}>maxsus takliflar</Text><Pressable onPress={() => router.push('/promos')}><Text style={[styles.promoButton, { color: colors.primary }]}>{t('details')} <Feather name="arrow-right" size={13} color={colors.primary} /></Text></Pressable></View>
        <View style={styles.promoIllustration}><MaterialCommunityIcons name="face-woman-shimmer-outline" size={82} color="#3ca979" /></View>
      </View>

      <SectionTitle title={t('nearby')} action={t('details')} onPress={() => router.push('/branches')} />
      <Pressable onPress={() => router.push('/branches')} style={[styles.branchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.branchIcon, { backgroundColor: colors.accent }]}><Feather name="map-pin" size={21} color={colors.primary} /></View>
        <View style={styles.branchCopy}><Text style={[styles.branchTitle, { color: colors.foreground }]}>Sog‘lom apteka №12</Text><Text style={[styles.branchMeta, { color: colors.mutedForeground }]}>Toshkent sh., Amir Temur ko‘chasi, 42</Text><Text style={[styles.branchOpen, { color: colors.primary }]}>{t('openNow')}  ·  08:00 — 22:00</Text></View><View style={styles.distance}><Text style={[styles.distanceText, { color: colors.foreground }]}>1.2 km</Text><ChevronIcon /></View>
      </Pressable>
      <View style={styles.statsRow}>
        <Stat icon="shopping-bag" value={`${user.purchases}`} label={t('purchasesCount')} />
        <Stat icon="trending-up" value={formatUzs(user.saved)} label={t('saved')} />
        <Stat icon="award" value={user.tier} label={t('level')} />
      </View>
    </Screen>
  );
}

function ChevronIcon() {
  const colors = useColors();
  return <Feather name="chevron-right" size={18} color={colors.mutedForeground} />;
}

function Stat({ icon, value, label }: { icon: keyof typeof Feather.glyphMap; value: string; label: string }) {
  const colors = useColors();
  return <View style={styles.stat}><Feather name={icon} size={16} color={colors.primary} /><Text style={[styles.statValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { fontFamily: 'Inter_500Medium', fontSize: 13, marginBottom: 2 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 23 },
  hero: { minHeight: 172, borderRadius: 24, padding: 18, overflow: 'hidden', marginBottom: 14 },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 21 },
  leafCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e5faea', justifyContent: 'center', alignItems: 'center' },
  brandName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 },
  brandSub: { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter_500Medium', fontSize: 8, letterSpacing: 1 },
  heroTitle: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20, maxWidth: 245, lineHeight: 26 },
  heroCaption: { color: 'rgba(255,255,255,0.78)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 6, maxWidth: 235 },
  heroDecoration: { position: 'absolute', right: 16, bottom: 18 },
  balanceCard: { borderRadius: 22, padding: 18, borderWidth: 1 },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  balance: { fontFamily: 'Inter_700Bold', fontSize: 29, marginTop: 5 },
  coin: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, marginBottom: 10 },
  tierIcon: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  tier: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  tierHint: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  progressCaption: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 },
  balanceActions: { flexDirection: 'row', gap: 9, marginTop: 17 },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  primaryButtonText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  secondaryButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  promoCard: { minHeight: 118, borderRadius: 22, padding: 16, flexDirection: 'row', overflow: 'hidden', marginTop: 25 },
  promoCopy: { flex: 1 },
  promoTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 22 },
  promoButton: { fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 13 },
  promoIllustration: { width: 100, justifyContent: 'flex-end', alignItems: 'center' },
  branchCard: { borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center' },
  branchIcon: { width: 43, height: 43, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  branchCopy: { flex: 1, marginLeft: 11 },
  branchTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  branchMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  branchOpen: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 4 },
  distance: { alignItems: 'flex-end', gap: 4 },
  distanceText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  statsRow: { flexDirection: 'row', marginTop: 20, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 4, borderRightWidth: 1, borderRightColor: '#dcebe2' },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 10 },
});