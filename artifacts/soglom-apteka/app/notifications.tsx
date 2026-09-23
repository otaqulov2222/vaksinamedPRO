import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';

/**
 * No customer-facing notification list API exists in the backend.
 * Worker "notification" jobs are internal / noop — do not invent inbox data.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Feather name="bell-off" size={28} color={PURPLE} />
        </View>
        <Text style={styles.title}>Bildirishnomalar hozircha mavjud emas</Text>
        <Text style={styles.body}>
          Push va ichki bildirishnomalar uchun server xizmati hali ulanmagan. Bu yerda soxta
          xabarlar ko‘rsatilmaydi.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nima kutilmoqda?</Text>
        <Text style={styles.cardText}>
          Keyingi versiyada buyurtma holati, cashback va aksiya xabarlari shu bo‘limda
          ko‘rinadi — faqat haqiqiy API ulanganidan keyin.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hozir nima qilish mumkin?</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push('/(tabs)/purchases')}>
          <MaterialCommunityIcons name="package-variant" size={20} color={PURPLE} />
          <Text style={styles.linkText}>Buyurtmalar holatini ko‘rish</Text>
          <Feather name="chevron-right" size={18} color="#C5CAD6" />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.linkRow} onPress={() => router.push('/promos')}>
          <MaterialCommunityIcons name="tag-outline" size={20} color={PURPLE} />
          <Text style={styles.linkText}>Aksiyalarni ko‘rish</Text>
          <Feather name="chevron-right" size={18} color="#C5CAD6" />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.linkRow} onPress={() => router.push('/cashback')}>
          <MaterialCommunityIcons name="wallet-outline" size={20} color={PURPLE} />
          <Text style={styles.linkText}>Cashback tarixi</Text>
          <Feather name="chevron-right" size={18} color="#C5CAD6" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  hero: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: PURPLE_DEEP,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
    marginBottom: 8,
  },
  cardText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
  },
  linkRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
});
