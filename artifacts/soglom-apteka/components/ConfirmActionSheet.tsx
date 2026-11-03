import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppBottomSheet } from '@/components/AppBottomSheet';

const INK = '#17162C';
const MUTED = '#64748B';
const PILL_BG = '#F3F2F7';
const DANGER = '#DC2626';
const DANGER_BG = '#FEE2E2';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  testID?: string;
};

/** Bottom-sheet confirm (native feel) — used for destructive actions like delete account. */
export function ConfirmActionSheet({
  visible,
  onClose,
  title,
  message,
  confirmText,
  cancelText,
  destructive,
  busy,
  onConfirm,
  testID,
}: Props) {
  return (
    <AppBottomSheet visible={visible} onClose={busy ? () => undefined : onClose} testID={testID}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={({ pressed }) => [
            styles.pill,
            destructive ? styles.pillDanger : styles.pillPrimary,
            (pressed || busy) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(busy), busy: Boolean(busy) }}
          testID={testID ? `${testID}-confirm` : undefined}
        >
          {busy ? (
            <ActivityIndicator color={destructive ? DANGER : INK} />
          ) : (
            <Text style={[styles.pillText, destructive && styles.pillTextDanger]} numberOfLines={1}>
              {confirmText}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={onClose}
          disabled={busy}
          style={({ pressed }) => [styles.pill, styles.pillCancel, pressed && styles.pressed]}
          accessibilityRole="button"
          testID={testID ? `${testID}-cancel` : undefined}
        >
          <Text style={styles.pillText} numberOfLines={1}>
            {cancelText}
          </Text>
        </Pressable>
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
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  actions: { gap: 10, paddingBottom: 8 },
  pill: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pillDanger: { backgroundColor: DANGER_BG },
  pillPrimary: { backgroundColor: '#F1EBFF' },
  pillCancel: { backgroundColor: PILL_BG },
  pressed: { opacity: 0.85 },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
    color: INK,
  },
  pillTextDanger: { color: DANGER },
});
