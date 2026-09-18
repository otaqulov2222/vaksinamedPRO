import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen, SectionTitle, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

export default function PurchasesScreen() {
  const colors = useColors();
  const { t, transactions, user } = useApp();
  return (
    <Screen>
      <View style={styles.top}><View><Text style={[styles.kicker, { color: colors.mutedForeground }]}>{t('purchases')}</Text><Text style={[styles.title, { color: colors.foreground }]}>{user.purchases} ta xarid</Text></View><View style={[styles.headerIcon, { backgroundColor: colors.accent }]}><Feather name="shopping-bag" size={20} color={colors.primary} /></View></View>
      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}><View><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Jami xaridlar</Text><Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatUzs(user.total)}</Text></View><View style={[styles.summaryArt, { backgroundColor: colors.secondary }]}><Feather name="trending-up" size={23} color={colors.primary} /></View></View>
      <SectionTitle title="Xaridlar tarixi" />
      <View style={styles.list}>{transactions.map((item) => <View key={item.id} style={[styles.purchase, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.purchaseIcon, { backgroundColor: colors.secondary }]}><Feather name="file-text" size={18} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.purchaseTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.branch}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.date} · #{item.id}</Text></View><View style={styles.amounts}><Text style={[styles.amount, { color: colors.foreground }]}>{formatUzs(item.amount)}</Text><Text style={[styles.cashback, { color: colors.primary }]}>+{formatUzs(item.cashback)}</Text></View></View>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  kicker: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 3 },
  headerIcon: { width: 46, height: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  summary: { borderWidth: 1, borderRadius: 20, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 21, marginTop: 5 },
  summaryArt: { width: 51, height: 51, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 9 },
  purchase: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center' },
  purchaseIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, marginLeft: 10 },
  purchaseTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 4 },
  amounts: { alignItems: 'flex-end' },
  amount: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  cashback: { fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 5 },
});