import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { LanguageFlag } from '@/components/LanguageFlag';
import { useApp } from '@/context/AppContext';
import { getLanguageMeta, type Language } from '@/lib/languages';

const SURFACE = 'rgba(255,255,255,0.96)';

type Props = {
  language: Language;
  onPress: () => void;
};

/**
 * Welcome language entry — current language as a drawable flag (not globe / emoji).
 * Native names live in LanguagePickerSheet.
 */
export function WelcomeLanguageControl({ language, onPress }: Props) {
  const { t } = useApp();
  const meta = getLanguageMeta(language);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('common.currentLanguageA11y', { name: meta.nativeName })}
      hitSlop={8}
      testID="welcome-language"
    >
      <LanguageFlag language={language} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(75,36,138,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 2px rgba(23,22,44,0.04), 0px 4px 12px rgba(53,23,101,0.06)',
  },
  pressed: { opacity: 0.86 },
});
