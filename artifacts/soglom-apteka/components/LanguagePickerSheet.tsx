import { Feather } from '@/components/AppIcon';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppBottomSheet } from '@/components/AppBottomSheet';
import { useApp } from '@/context/AppContext';
import { LANGUAGES, type Language } from '@/lib/languages';

const INK = '#17162C';
const MUTED = '#64748B';
const ROW_BG = '#F7F6FA';
const PRIMARY = '#4B248A';
const SELECTED_BG = '#F1EBFF';
const SELECTED_BORDER = 'rgba(75,36,138,0.22)';
const DIVIDER = 'rgba(75,36,138,0.06)';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect?: (language: Language) => void;
};

/**
 * Language list like Telegram / Helios / Siemens:
 * native endonyms + checkmark — no flags, no UZ/RU/EN codes.
 */
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
        {LANGUAGES.map((option, index) => {
          const selected = language === option.code;
          return (
            <Pressable
              key={option.code}
              onPress={() => pick(option.code)}
              style={({ pressed }) => [
                styles.row,
                selected && styles.rowSelected,
                index < LANGUAGES.length - 1 && styles.rowGap,
                pressed && styles.rowPressed,
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
              <Text style={[styles.rowText, selected && styles.rowTextSelected]} numberOfLines={1}>
                {option.nativeName}
              </Text>
              {selected ? <Feather name="check" size={18} color={PRIMARY} /> : <View style={styles.checkSpacer} />}
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
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  list: { paddingBottom: 8 },
  row: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: ROW_BG,
    borderWidth: 1,
    borderColor: DIVIDER,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowGap: { marginBottom: 8 },
  rowSelected: {
    backgroundColor: SELECTED_BG,
    borderColor: SELECTED_BORDER,
  },
  rowPressed: { opacity: 0.9 },
  rowText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 21,
    color: INK,
  },
  rowTextSelected: { color: PRIMARY },
  checkSpacer: { width: 18, height: 18 },
});
