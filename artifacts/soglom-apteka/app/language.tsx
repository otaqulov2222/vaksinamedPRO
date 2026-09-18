import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Language, useApp } from '@/context/AppContext';
import { Screen } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

const options: { value: Language; title: string; subtitle: string }[] = [
  { value: 'uz', title: 'O‘zbekcha', subtitle: 'Asosiy til' },
  { value: 'ru', title: 'Русский', subtitle: 'Russian' },
  { value: 'en', title: 'English', subtitle: 'English' },
];

export default function LanguageScreen() {
  const colors = useColors();
  const { t, language, setLanguage } = useApp();
  return (
    <Screen>
      <View style={[styles.hero, { backgroundColor: colors.secondary }]}><View style={[styles.icon, { backgroundColor: colors.primary }]}><Feather name="globe" size={25} color="#fff" /></View><Text style={[styles.title, { color: colors.foreground }]}>{t('chooseLanguage')}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Ilova matnlari siz tanlagan tilda ko‘rsatiladi</Text></View>
      <View style={styles.options}>{options.map((option) => <Pressable key={option.value} onPress={() => { setLanguage(option.value); router.back(); }} style={[styles.option, { backgroundColor: colors.card, borderColor: language === option.value ? colors.primary : colors.border }]}><View><Text style={[styles.optionTitle, { color: colors.foreground }]}>{option.title}</Text><Text style={[styles.optionSubtitle, { color: colors.mutedForeground }]}>{option.subtitle}</Text></View>{language === option.value ? <View style={[styles.check, { backgroundColor: colors.primary }]}><Feather name="check" size={15} color="#fff" /></View> : <View style={[styles.empty, { borderColor: colors.border }]} />}</Pressable>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, padding: 23, alignItems: 'center', marginBottom: 18 },
  icon: { width: 51, height: 51, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 13 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 6, textAlign: 'center' },
  options: { gap: 10 },
  option: { borderWidth: 1.5, borderRadius: 18, minHeight: 67, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  optionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  empty: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
});