import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppBottomSheet } from '@/components/AppBottomSheet';
import { useApp } from '@/context/AppContext';
import { LANGUAGES, type Language } from '@/lib/languages';

const INK = '#17162C';
const PILL_BG = '#F3F2F7';
const PILL_BORDER = 'rgba(75,36,138,0.08)';
const PRIMARY = '#4B248A';
const SELECTED_BG = '#F1EBFF';
const SELECTED_BORDER = 'rgba(75,36,138,0.28)';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect?: (language: Language) => void;
};

/** Korzinka-style language picker: bottom sheet + pill options (endonyms). */
export function LanguagePickerSheet({ visible, onClose, onSelect }: Props) {
  const { t, language, setLanguage } = useApp();

  const pick = (code: Language) => {
    setLanguage(code);
    onSelect?.(code);
    onClose();
  };

  return (
    <AppBottomSheet visible={visible} onClose={onClose} testID="language-picker-sheet">
      <Text style={styles.title} accessibilityRole="header">
        {t('common.appLanguage')}
      </Text>
      <View style={styles.list}>
        {LANGUAGES.map((option) => {
          const selected = language === option.code;
          return (
            <Pressable
              key={option.code}
              onPress={() => pick(option.code)}
              style={({ pressed }) => [
                styles.pill,
                selected && styles.pillSelected,
                pressed && styles.pillPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={
                selected
                  ? t('common.languageOptionSelectedA11y', { name: option.nativeName })
                  : t('common.languageOptionA11y', { name: option.nativeName })
              }
              testID={`language-option-${option.code}`}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]} numberOfLines={1}>
                {option.nativeName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: INK,
    letterSpacing: -0.3,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  list: { gap: 10, paddingBottom: 8 },
  pill: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: PILL_BG,
    borderWidth: 1,
    borderColor: PILL_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pillSelected: {
    backgroundColor: SELECTED_BG,
    borderColor: SELECTED_BORDER,
  },
  pillPressed: { opacity: 0.88 },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
    color: INK,
  },
  pillTextSelected: { color: PRIMARY },
});
