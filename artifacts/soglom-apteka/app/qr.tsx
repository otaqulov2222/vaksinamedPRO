import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

const qrPattern = [
  '111111100101101111111',
  '100000101011001000001',
  '101110101110101011101',
  '101110100011101011101',
  '101110101010101011101',
  '100000100110001000001',
  '111111101010101111111',
  '000000001111100000000',
  '110101111001011010101',
  '001101001111100110010',
  '111010110010111011101',
  '100111001101000111001',
  '011010111011101001110',
  '000000001010100000000',
  '111111101101111111101',
  '100000101011101000001',
  '101110101110101011101',
  '101110100100101011101',
  '101110101111101011101',
  '100000101001101000001',
  '111111101110101111111',
];

export default function QrScreen() {
  const colors = useColors();
  const { t, user, balance } = useApp();
  return (
    <Screen>
      <View style={styles.top}><Image source={require('../assets/images/vaksina-med-wordmark.png')} style={styles.qrWordmark} resizeMode="contain" /><View style={styles.spacer} /><Pressable onPress={() => router.push('/profile')}><Feather name="more-horizontal" size={22} color={colors.foreground} /></Pressable></View>
      <View style={[styles.qrCard, { backgroundColor: colors.primary }]}><Text style={styles.qrTitle}>{t('myQr')}</Text><Text style={styles.qrSubtitle}>Kassada ushbu kodni ko‘rsating</Text><View style={styles.qrWrap}><View style={styles.qrGrid}>{qrPattern.map((row, rowIndex) => row.split('').map((cell, cellIndex) => <View key={`${rowIndex}-${cellIndex}`} style={[styles.qrCell, { backgroundColor: cell === '1' ? '#122a25' : '#fff' }]} />))}</View></View><Text style={styles.code}>1234 5678 9012</Text><View style={styles.customerRow}><View><Text style={styles.customerLabel}>Mijoz</Text><Text style={styles.customerName}>{user.name}</Text></View><View style={styles.customerRight}><Text style={styles.customerLabel}>Cashback</Text><Text style={styles.customerName}>{formatUzs(balance)}</Text></View></View></View>
      <View style={[styles.tip, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.tipIcon, { backgroundColor: colors.secondary }]}><Feather name="shield" size={17} color={colors.primary} /></View><Text style={[styles.tipText, { color: colors.mutedForeground }]}>QR kodingizni boshqa odamlarga yubormang. U faqat shaxsiy profilingizga tegishli.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: 17 },
  qrWordmark: { width: 150, height: 24 },
  spacer: { flex: 1 },
  qrCard: { borderRadius: 25, padding: 18, alignItems: 'center' },
  qrTitle: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20 },
  qrSubtitle: { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  qrWrap: { backgroundColor: '#fff', borderRadius: 18, padding: 13, marginTop: 18 },
  qrGrid: { width: 228, height: 228, flexDirection: 'row', flexWrap: 'wrap' },
  qrCell: { width: '4.7619%', height: '4.7619%' },
  code: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 2, marginTop: 15 },
  customerRow: { width: '100%', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', justifyContent: 'space-between' },
  customerRight: { alignItems: 'flex-end' },
  customerLabel: { color: 'rgba(255,255,255,0.62)', fontFamily: 'Inter_400Regular', fontSize: 10 },
  customerName: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  tip: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  tipIcon: { width: 30, height: 30, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tipText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
});