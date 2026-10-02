import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import type { TranslationKey } from '@/lib/i18n';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqItem = {
  key: string;
  title: TranslationKey;
  body: TranslationKey;
  cta?: { label: TranslationKey; to: string };
};

/** FAQ content reflects features already present in the app — no invented contacts. */
const FAQ: FaqItem[] = [
  {
    key: 'orders',
    title: 'profile.helpOrdersTitle',
    body: 'profile.helpOrdersBody',
    cta: { label: 'profile.helpOrdersCta', to: '/(tabs)/purchases' },
  },
  {
    key: 'delivery',
    title: 'profile.helpDeliveryTitle',
    body: 'profile.helpDeliveryBody',
    cta: { label: 'profile.helpDeliveryCta', to: '/cart' },
  },
  {
    key: 'payment',
    title: 'profile.helpPaymentTitle',
    body: 'profile.helpPaymentBody',
    cta: { label: 'profile.helpPaymentCta', to: '/checkout' },
  },
  {
    key: 'cashback',
    title: 'common.navCashback',
    body: 'profile.helpCashbackBody',
    cta: { label: 'profile.helpCashbackCta', to: '/cashback' },
  },
  {
    key: 'branches',
    title: 'profile.helpBranchesTitle',
    body: 'profile.helpBranchesBody',
    cta: { label: 'profile.helpBranchesCta', to: '/branches' },
  },
  {
    key: 'rating',
    title: 'common.navRating',
    body: 'profile.helpRatingBody',
    cta: { label: 'profile.helpRatingCta', to: '/rating' },
  },
];

function FaqRow({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  const { t } = useApp();
  return (
    <View style={styles.faqBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.faqHead, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={t(item.title)}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.faqTitle}>{t(item.title)}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
      </Pressable>
      {open ? (
        <View style={styles.faqBody}>
          <Text style={styles.faqText}>{t(item.body)}</Text>
          {item.cta ? (
            <Pressable
              style={styles.cta}
              onPress={() => router.push(item.cta!.to as any)}
              accessibilityRole="button"
              accessibilityLabel={t(item.cta.label)}
            >
              <Text style={styles.ctaText}>{t(item.cta.label)}</Text>
              <Feather name="arrow-right" size={14} color={PURPLE} importantForAccessibility="no" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const [openKey, setOpenKey] = useState<string | null>('orders');

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKey((prev) => (prev === key ? null : key));
  };

  return (
    <ScrollView
      style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Feather name="help-circle" size={28} color={PURPLE} />
        </View>
        <Text style={styles.title}>{t('common.navHelp')}</Text>
        <Text style={styles.subtitle}>{t('profile.helpSubtitle')}</Text>
      </View>

      <View style={styles.card}>
        {FAQ.map((item, i) => (
          <View key={item.key}>
            <FaqRow item={item} open={openKey === item.key} onToggle={() => toggle(item.key)} />
            {i < FAQ.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <MaterialCommunityIcons name="information-outline" size={18} color={MUTED} />
        <Text style={styles.noteText}>{t('profile.helpNote')}</Text>
      </View>

      <Pressable style={styles.primaryBtn} onPress={() => router.push('/branches')}>
        <Text style={styles.primaryBtnText}>{t('profile.helpBranchesButton')}</Text>
      </Pressable>
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
    padding: 20,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    marginBottom: 8,
  },
  subtitle: {
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
    overflow: 'hidden',
  },
  faqBlock: { paddingHorizontal: 14 },
  faqHead: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  faqTitle: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  faqBody: { paddingBottom: 14 },
  faqText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
  },
  cta: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
  },
  ctaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginHorizontal: 14,
  },
  note: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  noteText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    lineHeight: 17,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
});
