import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { LanguageFlag } from '@/components/LanguageFlag';
import { useApp } from '@/context/AppContext';
import { getLanguageMeta, type Language } from '@/lib/languages';

type Props = {
  language: Language;
  onPress: () => void;
};

/**
 * Welcome language entry — flag only (no circular chip / fill behind it).
 */
export function WelcomeLanguageControl({ language, onPress }: Props) {
  const { t } = useApp();
  const meta = getLanguageMeta(language);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('common.currentLanguageA11y', { name: meta.nativeName })}
      hitSlop={10}
      testID="welcome-language"
    >
      <View style={styles.flag}>
        <LanguageFlag language={language} size={24} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: {
    borderRadius: 4,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(23,22,44,0.12)' } as object,
      default: {
        shadowColor: '#17162C',
        shadowOpacity: 0.14,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      },
    }),
  },
  pressed: { opacity: 0.82 },
});
