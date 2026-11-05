import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { getLanguageMeta, type Language } from '@/lib/languages';

const PRIMARY = '#4B248A';
const MUTED = '#64748B';
const SURFACE = 'rgba(255,255,255,0.96)';

type Props = {
  language: Language;
  onPress: () => void;
};

/**
 * Compact welcome language affordance: globe + current code.
 * Opens the shared bottom sheet — no wide UZ|RU|EN strip.
 */
export function WelcomeLanguageControl({ language, onPress }: Props) {
  const { t } = useApp();
  const meta = getLanguageMeta(language);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('common.currentLanguageA11y', { name: meta.nativeName })}
      hitSlop={6}
      testID="welcome-language"
    >
      <View style={styles.iconDisc}>
        <Feather name="globe" size={15} color={PRIMARY} />
      </View>
      <Text style={styles.code}>{meta.shortCode}</Text>
      <Feather name="chevron-down" size={13} color={MUTED} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(75,36,138,0.10)',
    boxShadow: '0px 1px 2px rgba(23,22,44,0.04), 0px 6px 16px rgba(53,23,101,0.07)',
  },
  pressed: { opacity: 0.88 },
  iconDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.5,
    color: PRIMARY,
  },
});
