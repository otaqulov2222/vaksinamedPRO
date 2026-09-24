import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  title: string;
  body: string;
  cta?: { label: string; to: string };
};

/** FAQ content reflects features already present in the app — no invented contacts. */
const FAQ: FaqItem[] = [
  {
    key: 'orders',
    title: 'Buyurtma bo‘yicha yordam',
    body: 'Buyurtmalar bo‘limida buyurtma holatini ko‘rishingiz mumkin. Buyurtmani bekor qilish imkoniyati mavjud bo‘lsa, buyurtma kartochkasidan amalga oshiriladi.',
    cta: { label: 'Buyurtmalarga o‘tish', to: '/(tabs)/purchases' },
  },
  {
    key: 'delivery',
    title: 'Yetkazib berish',
    body: 'Buyurtmani rasmiylashtirishda filialdan olish yoki yetkazib berish usulini tanlash mumkin. Aniq muddat va narx buyurtma jarayonida ko‘rsatiladi.',
    cta: { label: 'Savatga o‘tish', to: '/cart' },
  },
  {
    key: 'payment',
    title: 'To‘lov',
    body: 'Hozircha filialda to‘lash (FOM) va yetkazib berganda to‘lash (COD) mavjud. Onlayn Payme/Click production muhitida o‘chirilgan — yoqilmaguncha ilovada ishlamaydi.',
    cta: { label: 'Rasmiylashtirish', to: '/checkout' },
  },
  {
    key: 'cashback',
    title: 'Cashback',
    body: 'Cashback balansi, daraja va tarixni Cashback bo‘limida ko‘ring. Bitta balans — yakunlangan xaridlardan (ilova yoki kassa); to‘lov usuli emas.',
    cta: { label: 'Cashbackni ochish', to: '/cashback' },
  },
  {
    key: 'branches',
    title: 'Filiallar',
    body: 'Yaqin dorixonani xarita va ro‘yxat orqali topishingiz mumkin. Joylashuv ruxsati berilsa, masofa bo‘yicha tartiblanadi.',
    cta: { label: 'Dorixonalarni ochish', to: '/branches' },
  },
  {
    key: 'rating',
    title: 'Xizmatni baholash',
    body: 'Yakunlangan buyurtma uchun filial xizmatini baholashingiz mumkin. Alohida xodim tanlash hozircha mavjud emas — buyurtmaga bog‘langan xodim identifikatori yo‘q.',
    cta: { label: 'Baholashga o‘tish', to: '/rating' },
  },
];

function FaqRow({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <View style={styles.faqBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.faqHead, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.faqTitle}>{item.title}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
      </Pressable>
      {open ? (
        <View style={styles.faqBody}>
          <Text style={styles.faqText}>{item.body}</Text>
          {item.cta ? (
            <Pressable
              style={styles.cta}
              onPress={() => router.push(item.cta!.to as any)}
              accessibilityRole="button"
              accessibilityLabel={item.cta.label}
            >
              <Text style={styles.ctaText}>{item.cta.label}</Text>
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
        <Text style={styles.title}>Yordam markazi</Text>
        <Text style={styles.subtitle}>
          Ilovadagi asosiy bo‘limlar bo‘yicha qisqa yo‘riqnoma. Aloqa raqami yoki email
          konfiguratsiyada belgilangan emas — shuning uchun bu yerda soxta kontaktlar yo‘q.
        </Text>
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
        <Text style={styles.noteText}>
          Qo‘shimcha yordam kerak bo‘lsa, yaqin Vaksina Med filialiga murojaat qiling.
        </Text>
      </View>

      <Pressable style={styles.primaryBtn} onPress={() => router.push('/branches')}>
        <Text style={styles.primaryBtnText}>Filiallarni ko‘rish</Text>
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
