import { Feather } from '@/components/AppIcon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import type { TranslationKey } from '@/lib/i18n';
import { SUPPORT_CONTACTS } from '@/lib/supportContacts';

const PURPLE = '#4B248A';
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
    cta: { label: 'profile.helpDeliveryCta', to: '/branches' },
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

type ContactRow = {
  key: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  labelKey: TranslationKey;
  a11yKey: TranslationKey;
  value: string;
  url: string;
};

function buildContactRows(mailSubject: string): ContactRow[] {
  return [
    {
      key: 'phone',
      icon: 'phone',
      labelKey: 'profile.helpContactPhone',
      a11yKey: 'profile.helpContactPhoneA11y',
      value: SUPPORT_CONTACTS.phoneDisplay,
      url: `tel:${SUPPORT_CONTACTS.phoneE164}`,
    },
    {
      key: 'email',
      icon: 'mail',
      labelKey: 'profile.helpContactEmail',
      a11yKey: 'profile.helpContactEmailA11y',
      value: SUPPORT_CONTACTS.email,
      url: `mailto:${SUPPORT_CONTACTS.email}?subject=${encodeURIComponent(mailSubject)}`,
    },
    {
      key: 'telegram',
      icon: 'send',
      labelKey: 'profile.helpContactTelegram',
      a11yKey: 'profile.helpContactTelegramA11y',
      value: SUPPORT_CONTACTS.telegramHandle,
      url: SUPPORT_CONTACTS.telegramUrl,
    },
    {
      key: 'web',
      icon: 'globe',
      labelKey: 'profile.helpContactWebsite',
      a11yKey: 'profile.helpContactWebsiteA11y',
      value: SUPPORT_CONTACTS.websiteDisplay,
      url: SUPPORT_CONTACTS.websiteUrl,
    },
  ];
}

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
  const contactRows = useMemo(() => buildContactRows(t('profile.helpMailSubject')), [t]);

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKey((prev) => (prev === key ? null : key));
  };

  const openContact = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}
        contentContainerStyle={styles.content}
        horizontal={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Feather name="headphones" size={28} color={PURPLE} />
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

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>{t('profile.helpContactTitle')}</Text>
          <Text style={styles.contactSubtitle}>{t('profile.helpContactSubtitle')}</Text>
          {contactRows.map((row, i) => (
            <View key={row.key}>
              {i > 0 ? <View style={styles.contactDivider} /> : null}
              <Pressable
                onPress={() => openContact(row.url)}
                style={({ pressed }) => [styles.contactRow, pressed && { opacity: 0.82 }]}
                accessibilityRole="link"
                accessibilityLabel={`${t(row.a11yKey)}: ${row.value}`}
              >
                <View style={styles.contactIcon}>
                  <Feather name={row.icon} size={18} color={PURPLE} />
                </View>
                <View style={styles.contactCopy}>
                  <Text style={styles.contactLabel}>{t(row.labelKey)}</Text>
                  <Text style={styles.contactValue} numberOfLines={1}>
                    {row.value}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color="#CBD5E1" />
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <MaterialCommunityIcons name="information-outline" size={18} color={MUTED} />
          <Text style={styles.noteText}>{t('profile.helpNote')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: BG,
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  root: { flex: 1, width: '100%', maxWidth: '100%', backgroundColor: BG },
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
    boxShadow: '0 4px 16px rgba(42,16,78,0.04)',
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
    boxShadow: '0 2px 10px rgba(42,16,78,0.03)',
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
  contactCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 6,
    boxShadow: '0 2px 10px rgba(42,16,78,0.03)',
  },
  contactTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  contactSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: MUTED,
    lineHeight: 17,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  contactRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactCopy: { flex: 1, minWidth: 0 },
  contactLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    marginBottom: 2,
  },
  contactValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  contactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
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
});
