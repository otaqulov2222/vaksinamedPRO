import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { LANGUAGES, type Language } from '@/lib/languages';

const PRIMARY = '#4B248A';
const MUTED = '#64748B';
const SURFACE = 'rgba(255,255,255,0.94)';
const SELECTED_BG = '#F1EBFF';

type Props = {
  language: Language;
  onChange: (language: Language) => void;
};

/**
 * Welcome-screen language switch: compact UZ · RU · EN segments.
 * One tap — no flag chip, no floating “tourist” badge.
 */
export function WelcomeLanguageControl({ language, onChange }: Props) {
  const { t } = useApp();

  return (
    <View
      style={styles.strip}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.appLanguage')}
      testID="welcome-language"
    >
      {LANGUAGES.map((option) => {
        const selected = language === option.code;
        return (
          <Pressable
            key={option.code}
            onPress={() => onChange(option.code)}
            style={({ pressed }) => [styles.seg, selected && styles.segOn, pressed && styles.segPressed]}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={
              selected
                ? t('common.languageOptionSelectedA11y', { name: option.nativeName })
                : t('common.languageOptionA11y', { name: option.nativeName })
            }
            testID={`welcome-language-${option.code}`}
          >
            <Text style={[styles.segText, selected && styles.segTextOn]}>{option.shortCode}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(75,36,138,0.10)',
    boxShadow: '0px 1px 2px rgba(23,22,44,0.04), 0px 6px 16px rgba(53,23,101,0.07)',
  },
  seg: {
    minWidth: 40,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: SELECTED_BG },
  segPressed: { opacity: 0.88 },
  segText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.6,
    color: MUTED,
  },
  segTextOn: { color: PRIMARY },
});
