import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LanguageFlag } from '@/components/LanguageFlag';
import { useApp } from '@/context/AppContext';
import { getLanguageMeta, type Language } from '@/lib/languages';

const PRIMARY = '#4B248A';
const INK = '#17162C';
const CARD = '#FFFFFF';

type Props = {
  language: Language;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Compact header pill: [drawable flag] UZ ▾
 * Never concatenates language id ("uz") with shortCode ("UZ").
 */
export function LanguageBadge({ language, onPress, accessibilityLabel }: Props) {
  const { t } = useApp();
  const meta = getLanguageMeta(language);
  const label = accessibilityLabel ?? t('common.currentLanguageA11y', { name: meta.nativeName });

  return (
    <Pressable
      style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <LanguageFlag language={language} size={14} />
      <Text style={styles.code}>{meta.shortCode}</Text>
      <Feather name="chevron-down" size={14} color={PRIMARY} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 10,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(75,36,138,0.08)',
    boxShadow: '0px 1px 2px rgba(23,22,44,0.04), 0px 4px 12px rgba(53,23,101,0.06)',
  },
  pressed: { opacity: 0.85 },
  code: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 16,
    color: INK,
    letterSpacing: 0.4,
  },
});
