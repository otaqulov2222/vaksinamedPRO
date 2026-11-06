import { Feather } from '@/components/AppIcon';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';

const PRIMARY = '#4B248A';
const BG = '#F7F6FA';
const SURFACE = '#FFFFFF';
const INK = '#17162C';
const MUTED = '#64748B';
const BORDER = '#EFEBF6';

/** Home delivery is disabled — addresses are not used. Kept as a deep-link screen. */
export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Feather name="map-pin" size={28} color={PRIMARY} />
        </View>
        <Text style={styles.title}>{t('profile.addressesDisabledTitle')}</Text>
        <Text style={styles.body}>{t('profile.addressesDisabledBody')}</Text>
        <Pressable
          style={styles.cta}
          onPress={() => router.push('/branches')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.helpDeliveryCta')}
          testID="addresses-disabled-branches"
        >
          <Text style={styles.ctaText}>{t('profile.helpDeliveryCta')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: INK,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
  },
  cta: {
    marginTop: 8,
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
