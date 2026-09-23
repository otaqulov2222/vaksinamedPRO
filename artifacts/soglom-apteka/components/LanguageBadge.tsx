import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LanguageFlag } from '@/components/LanguageFlag';
import { getLanguageMeta, type Language } from '@/lib/languages';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
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
  const meta = getLanguageMeta(language);
  const label = accessibilityLabel ?? `Til: ${meta.nativeName}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.badge, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <LanguageFlag language={language} size={16} />
      <Text style={styles.code}>{meta.shortCode}</Text>
      <Feather name="chevron-down" size={14} color={PURPLE} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 7,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#ECEEF5',
  },
  code: {
    fontSize: 12,
    fontWeight: '700',
    color: PURPLE_DEEP,
    letterSpacing: 0.3,
  },
});
