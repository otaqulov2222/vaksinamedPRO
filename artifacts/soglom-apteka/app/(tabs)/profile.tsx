import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Chevron, Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const { t, user, language } = useApp();
  const rows = [
    { icon: 'credit-card', label: t('cashback'), value: formatUzs(125500), onPress: () => router.push('/cashback') },
    { icon: 'award', label: t('level'), value: t('gold'), onPress: () => router.push('/(tabs)/bonuses') },
    { icon: 'bell', label: t('notifications'), onPress: () => Alert.alert(t('notifications'), 'Cashback, aksiyalar va bonuslar bildirishnomalari yoqilgan.') },
    { icon: 'help-circle', label: t('help'), onPress: () => Alert.alert(t('help'), 'Savollaringiz bo‘lsa, biz har kuni 09:00–21:00 javob beramiz.') },
    { icon: 'info', label: t('about'), onPress: () => Alert.alert(t('about'), 'Sog‘lom Apteka Loyalty v1.0') },
  ] as const;
  return (
    <Screen>
      <View style={styles.top}><Text style={[styles.title, { color: colors.foreground }]}>{t('profile')}</Text><Pressable onPress={() => router.push('/language')} style={[styles.langBadge, { backgroundColor: colors.secondary }]}><Text style={[styles.langText, { color: colors.primary }]}>{language.toUpperCase()}</Text><Feather name="chevron-down" size={14} color={colors.primary} /></Pressable></View>
      <View style={[styles.profileCard, { backgroundColor: colors.primary }]}><View style={styles.avatar}><Text style={[styles.avatarText, { color: colors.primary }]}>SA</Text></View><View style={styles.profileCopy}><Text style={styles.profileName}>{user.name}</Text><Text style={styles.profilePhone}>{user.phone}</Text><View style={styles.goldChip}><MaterialCommunityIcons name="medal-outline" size={13} color="#956331" /><Text style={styles.goldText}>{t('gold')}</Text></View></View><Feather name="edit-2" size={17} color="rgba(255,255,255,0.75)" /></View>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('profileInfo')}</Text>
      <View style={[styles.rows, { backgroundColor: colors.card, borderColor: colors.border }]}>{rows.map((row) => <Pressable key={row.label} onPress={row.onPress} style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name={row.icon} size={17} color={colors.primary} /></View><Text style={[styles.rowLabel, { color: colors.foreground }]}>{row.label}</Text>{'value' in row && row.value ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{row.value}</Text> : null}<Chevron /></Pressable>)}</View>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('settings')}</Text>
      <Pressable onPress={() => router.push('/language')} style={[styles.settingsRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name="globe" size={17} color={colors.primary} /></View><Text style={[styles.rowLabel, { color: colors.foreground }]}>{t('language')}</Text><Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{language === 'uz' ? t('uzbek') : language === 'ru' ? t('russian') : t('english')}</Text><Chevron /></Pressable>
      <Pressable onPress={() => Alert.alert(t('logout'), 'Siz demo rejimidasiz.')} style={[styles.logout, { borderColor: '#efbcbc' }]}><Feather name="log-out" size={17} color={colors.destructive} /><Text style={[styles.logoutText, { color: colors.destructive }]}>{t('logout')}</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  langBadge: { borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  langText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  profileCard: { borderRadius: 22, padding: 17, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#e4faea', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  profilePhone: { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  goldChip: { backgroundColor: '#f4e4c7', borderRadius: 9, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 8 },
  goldText: { color: '#956331', fontFamily: 'Inter_700Bold', fontSize: 9 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 25, marginBottom: 9, marginLeft: 3 },
  rows: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { minHeight: 59, borderBottomWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  rowIcon: { width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginLeft: 11, flex: 1 },
  rowValue: { fontFamily: 'Inter_400Regular', fontSize: 10, marginRight: 8 },
  settingsRow: { borderWidth: 1, borderRadius: 18, minHeight: 59, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  logout: { marginTop: 24, minHeight: 48, borderWidth: 1, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 7 },
  logoutText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});