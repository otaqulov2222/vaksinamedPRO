import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

const promos = [
  { title: 'Vitaminlar haftaligi', subtitle: 'Vitaminlar uchun 5% cashback', tag: '01.10 — 07.10', icon: 'pill', bg: '#e1f6e8' },
  { title: 'Sodiq mijozlar kuni', subtitle: 'Barcha mahsulotlarga 10% chegirma', tag: 'Faqat Gold uchun', icon: 'star-four-points', bg: '#fff2d5' },
  { title: 'Sog‘lom parvarish', subtitle: 'Kosmetika xaridida maxsus bonuslar', tag: 'Yangi', icon: 'flower-outline', bg: '#f9e9ee' },
];

export default function PromosScreen() {
  const colors = useColors();
  return (
    <Screen>
      <View style={styles.heading}><Text style={[styles.title, { color: colors.foreground }]}>Maxsus takliflar</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Siz uchun tanlangan aksiyalar</Text></View>
      <View style={styles.list}>{promos.map((promo) => <Pressable key={promo.title} onPress={() => router.push('/qr')} style={({ pressed }) => [styles.promo, { backgroundColor: promo.bg, opacity: pressed ? 0.78 : 1 }]}><View style={styles.promoCopy}><View style={[styles.tag, { backgroundColor: 'rgba(255,255,255,0.7)' }]}><Text style={[styles.tagText, { color: colors.primary }]}>{promo.tag}</Text></View><Text style={[styles.promoTitle, { color: colors.foreground }]}>{promo.title}</Text><Text style={[styles.promoSubtitle, { color: colors.mutedForeground }]}>{promo.subtitle}</Text><Text style={[styles.open, { color: colors.primary }]}>Batafsil <Feather name="arrow-right" size={13} color={colors.primary} /></Text></View><View style={styles.promoArt}><MaterialCommunityIcons name={promo.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={66} color={colors.primary} /></View></Pressable>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 18 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  list: { gap: 12 },
  promo: { minHeight: 164, borderRadius: 23, padding: 18, flexDirection: 'row', overflow: 'hidden' },
  promoCopy: { flex: 1 },
  tag: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  promoTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 15, maxWidth: 190 },
  promoSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 6, maxWidth: 200 },
  open: { fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 17 },
  promoArt: { width: 78, alignItems: 'center', justifyContent: 'center' },
});