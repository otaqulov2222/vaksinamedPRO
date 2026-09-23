import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { LanguageFlag } from '@/components/LanguageFlag';
import { Screen } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { LANGUAGES, type Language } from '@/lib/languages';

export default function LanguageScreen() {
  const colors = useColors();
  const { t, language, setLanguage } = useApp();

  const onSelect = (value: Language) => {
    setLanguage(value);
    // Preserve Profile (or prior stack parent). Never jump to Home.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <Screen>
      <View style={[styles.hero, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('chooseLanguage')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Tanlangan til saqlanadi. Ba’zi ekranlar hali to‘liq tarjima qilinmagan.
        </Text>
      </View>

      <View style={styles.options}>
        {LANGUAGES.map((option) => {
          const selected = language === option.code;
          return (
            <Pressable
              key={option.code}
              onPress={() => onSelect(option.code)}
              style={[
                styles.option,
                {
                  backgroundColor: colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Til: ${option.nativeName}${selected ? ', tanlangan' : ''}`}
            >
              <LanguageFlag language={option.code} size={22} />
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {option.nativeName}
                </Text>
                <Text style={[styles.optionSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {option.shortCode} · {option.displayName}
                </Text>
              </View>
              {selected ? (
                <View style={[styles.check, { backgroundColor: colors.primary }]}>
                  <Feather name="check" size={15} color="#fff" />
                </View>
              ) : (
                <View style={[styles.empty, { borderColor: colors.border }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  options: { gap: 10 },
  option: {
    borderWidth: 1.5,
    borderRadius: 18,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  optionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
  },
});
