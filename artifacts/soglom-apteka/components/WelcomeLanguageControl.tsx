import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useApp } from '@/context/AppContext';
import { getLanguageMeta, type Language } from '@/lib/languages';

const PRIMARY = '#4B248A';
const SURFACE = 'rgba(255,255,255,0.96)';

type Props = {
  language: Language;
  onPress: () => void;
};

/**
 * Welcome language entry — pattern used by major apps (Telegram settings,
 * HashiCorp Helios, Siemens Healthineers): globe only in the corner.
 * No flags, no UZ/RU/EN codes. Native names live in LanguagePickerSheet.
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
      <Feather name="globe" size={18} color={PRIMARY} />
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
