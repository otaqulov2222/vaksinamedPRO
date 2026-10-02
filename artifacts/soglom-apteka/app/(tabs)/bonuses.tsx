import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen, SectionTitle } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { notify } from '@/lib/dialogs';

export default function BonusesScreen() {
  const colors = useColors();
  const { t, fmt, balance, rewards, redeemedRewards, redeemReward, loading } = useApp();
  const handleRedeem = async (reward: (typeof rewards)[number]) => {
    if (redeemedRewards.includes(reward.id)) return;
    const success = await redeemReward(reward);
    if (success) notify(t('home.rewardRedeemed'), reward.title);
    else notify(t('home.rewardRedeemFailed'), t('home.rewardMinRequired', { amount: fmt.money(reward.points) }));
  };
  return (
    <Screen>
      <View style={styles.top}><View><Text style={[styles.kicker, { color: colors.mutedForeground }]}>{t('home.bonusesKicker')}</Text><Text style={[styles.title, { color: colors.foreground }]}>{t('home.rewardsTitle')}</Text></View><View style={[styles.pointsBadge, { backgroundColor: '#fff1c9' }]}><MaterialCommunityIcons name="star-four-points" size={16} color="#db9e14" /><Text style={styles.pointsText}>{balance}</Text></View></View>
      <View style={[styles.intro, { backgroundColor: colors.secondary }]}><View style={[styles.introIcon, { backgroundColor: colors.primary }]}><Feather name="gift" size={21} color="#fff" /></View><View style={{ flex: 1 }}><Text style={[styles.introTitle, { color: colors.foreground }]}>{t('home.rewardsIntroTitle')}</Text><Text style={[styles.introText, { color: colors.mutedForeground }]}>{t('home.rewardsIntroText')}</Text></View></View>
      <SectionTitle title={t('home.rewardsCatalog')} />
      {loading ? (
        <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>{t('common.loading')}</Text>
      ) : !rewards.length ? (
        <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>{t('home.rewardsEmpty')}</Text>
      ) : (
        <View style={styles.grid}>{rewards.map((reward) => { const redeemed = redeemedRewards.includes(reward.id); return <View key={reward.id} style={[styles.reward, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.rewardArt, { backgroundColor: reward.accent }]}><MaterialCommunityIcons name={reward.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={37} color={colors.primary} /></View><Text style={[styles.rewardTitle, { color: colors.foreground }]} numberOfLines={2}>{reward.title}</Text><Text style={[styles.rewardSubtitle, { color: colors.mutedForeground }]}>{reward.subtitle}</Text><View style={styles.rewardFooter}><View style={styles.cost}><MaterialCommunityIcons name="star-four-points" size={13} color="#dfa81e" /><Text style={[styles.costText, { color: colors.foreground }]}>{reward.points}</Text></View><Pressable disabled={redeemed} onPress={() => handleRedeem(reward)} style={[styles.redeem, { backgroundColor: redeemed ? colors.muted : colors.primary }]}><Text style={[styles.redeemText, { color: redeemed ? colors.mutedForeground : '#fff' }]}>{redeemed ? '✓' : t('home.rewardRedeem')}</Text></Pressable></View></View>; })}</View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  kicker: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 3 },
  pointsBadge: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 5, alignItems: 'center' },
  pointsText: { color: '#8b650f', fontFamily: 'Inter_700Bold', fontSize: 13 },
  intro: { borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  introIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  introText: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4, lineHeight: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  reward: { width: '48.3%', borderRadius: 18, borderWidth: 1, padding: 9 },
  rewardArt: { height: 112, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  rewardTitle: { fontFamily: 'Inter_700Bold', fontSize: 11, lineHeight: 15, minHeight: 30 },
  rewardSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 },
  rewardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  costText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  redeem: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  redeemText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
});