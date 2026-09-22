import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const YELLOW = '#FFCC00';

function appVersion() {
  const fromExpo = Constants.expoConfig?.version || Constants.nativeAppVersion;
  return fromExpo || '1.0.0';
}

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const version = appVersion();
  const build =
    Constants.expoConfig?.ios?.buildNumber ||
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null);

  return (
    <ScrollView
      style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Image
          source={require('../assets/images/vaksina-mark-clean.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brand}>
          <Text style={{ color: PURPLE }}>VAKSINA </Text>
          <Text style={{ color: YELLOW }}>MED</Text>
        </Text>
        <Text style={styles.tagline}>Sodiqlik dasturi va onlayn dorixona xizmati</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ilova haqida</Text>
        <Text style={styles.cardText}>
          Vaksina Med ilovasi orqali mahsulotlarni ko‘rish, buyurtma berish, cashback balansini
          kuzatish va yaqin filiallarni topish mumkin.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.metaRow}>
          <Feather name="smartphone" size={18} color={PURPLE} />
          <Text style={styles.metaLabel}>Versiya</Text>
          <Text style={styles.metaValue}>{version}</Text>
        </View>
        {build ? (
          <>
            <View style={styles.divider} />
            <View style={styles.metaRow}>
              <Feather name="hash" size={18} color={PURPLE} />
              <Text style={styles.metaLabel}>Build</Text>
              <Text style={styles.metaValue}>{build}</Text>
            </View>
          </>
        ) : null}
        <View style={styles.divider} />
        <View style={styles.metaRow}>
          <Feather name="package" size={18} color={PURPLE} />
          <Text style={styles.metaLabel}>Ilova</Text>
          <Text style={styles.metaValue}>Vaksina Med</Text>
        </View>
      </View>

      <Text style={styles.footerNote}>
        Maxfiylik siyosati va foydalanish shartlari havolalari hozircha ilovada joylashtirilmagan.
      </Text>
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
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  logo: { width: 72, height: 72, marginBottom: 12 },
  brand: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    letterSpacing: 0.3,
  },
  tagline: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
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
  metaRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaLabel: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  metaValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  footerNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
});
