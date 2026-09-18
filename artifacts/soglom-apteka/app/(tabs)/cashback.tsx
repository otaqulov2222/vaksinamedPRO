import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Pill, Screen, SectionTitle, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

export default function CashbackScreen() {
  const colors = useColors();
  const { t, balance, transactions } = useApp();
  const [filter, setFilter] = useState<'all' | 'earn' | 'use'>('all');
  const list = filter === 'all' ? transactions : transactions.filter((item) => item.kind === filter);
  return (
    <Screen>
      <View style={styles.top}><View><Text style={[styles.kicker, { color: colors.mutedForeground }]}>{t('cashback')}</Text><Text style={[styles.title, { color: colors.foreground }]}>{t('balance')}</Text></View><View style={[styles.wallet, { backgroundColor: colors.accent }]}><MaterialCommunityIcons name="wallet-outline" size={22} color={colors.primary} /></View></View>
      <View style={[styles.bigCard, { backgroundColor: colors.primary }]}>
        <Text style={styles.bigLabel}>{t('available')}</Text>
        <Text style={styles.bigAmount}>{formatUzs(balance)}</Text>
        <View style={styles.bigBottom}><Text style={styles.smallLight}>Muddati: 18.12.2026</Text><MaterialCommunityIcons name="cash-multiple" size={34} color="rgba(255,255,255,0.3)" /></View>
      </View>
      <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.infoIcon, { backgroundColor: colors.accent }]}><Feather name="info" size={17} color={colors.primary} /></View><Text style={[styles.infoText, { color: colors.mutedForeground }]}>Cashback 90 kun davomida amal qiladi. Xarid vaqtida QR kodingizni ko‘rsating.</Text></View>
      <SectionTitle title={t('history')} />
      <View style={styles.filterRow}><Pressable onPress={() => setFilter('all')}><Pill active={filter === 'all'}>{t('all')}</Pill></Pressable><Pressable onPress={() => setFilter('earn')}><Pill active={filter === 'earn'}>{t('earned')}</Pill></Pressable><Pressable onPress={() => setFilter('use')}><Pill active={filter === 'use'}>{t('used')}</Pill></Pressable></View>
      <View style={styles.list}>{list.map((item) => <View key={item.id} style={[styles.transaction, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.transactionIcon, { backgroundColor: item.kind === 'earn' ? colors.accent : '#fff0df' }]}><Feather name={item.kind === 'earn' ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={item.kind === 'earn' ? colors.primary : '#d99517'} /></View><View style={styles.transactionCopy}><Text style={[styles.transactionTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.transactionMeta, { color: colors.mutedForeground }]}>{item.date}  ·  #{item.id}</Text></View><Text style={[styles.transactionAmount, { color: item.kind === 'earn' ? colors.primary : '#d99517' }]}>{item.kind === 'earn' ? '+' : '-'}{formatUzs(item.cashback)}</Text></View>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  kicker: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 3 },
  wallet: { width: 46, height: 46, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bigCard: { minHeight: 185, borderRadius: 24, padding: 21, justifyContent: 'space-between' },
  bigLabel: { color: 'rgba(255,255,255,0.78)', fontFamily: 'Inter_500Medium', fontSize: 13 },
  bigAmount: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 31 },
  bigBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  smallLight: { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter_400Regular', fontSize: 11 },
  infoBox: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13 },
  infoIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  list: { gap: 9 },
  transaction: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center' },
  transactionIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  transactionCopy: { flex: 1, marginLeft: 10 },
  transactionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  transactionMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  transactionAmount: { fontFamily: 'Inter_700Bold', fontSize: 11 },
});