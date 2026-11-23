import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmActionSheet } from '@/components/ConfirmActionSheet';
import {
  registerAppDialogHost,
  type AppConfirmRequest,
  type AppNotifyRequest,
  type AppNotifyTone,
} from '@/lib/dialogs';
import { tr } from '@/lib/i18n';

const TOAST_MS = 2600;
const INK = '#17162C';
const MUTED = '#64748B';
const PURPLE = '#6A22D6';
const SUCCESS = '#059669';
const DANGER = '#DC2626';

function iconFor(tone: AppNotifyTone): { name: keyof typeof Feather.glyphMap; color: string } {
  if (tone === 'error') return { name: 'alert-circle', color: DANGER };
  if (tone === 'info') return { name: 'info', color: PURPLE };
  return { name: 'check-circle', color: SUCCESS };
}

/**
 * Global in-app notify toast + confirm sheet.
 * Replaces native window.alert / window.confirm (Electron/web) and can stand in for Alert.
 */
export function AppDialogHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<AppNotifyRequest | null>(null);
  const [confirm, setConfirm] = useState<AppConfirmRequest | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(16)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearHideTimer();
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(toastY, {
        toValue: 12,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [clearHideTimer, toastOpacity, toastY]);

  const showToast = useCallback(
    (req: AppNotifyRequest) => {
      clearHideTimer();
      toastSeq.current += 1;
      const seq = toastSeq.current;
      setToast(req);
      toastOpacity.setValue(0);
      toastY.setValue(18);
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(toastY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        if (toastSeq.current === seq) hideToast();
      }, TOAST_MS);
    },
    [clearHideTimer, hideToast, toastOpacity, toastY],
  );

  const showConfirm = useCallback((req: AppConfirmRequest) => {
    setConfirm(req);
  }, []);

  useEffect(() => {
    return registerAppDialogHost({
      notify: showToast,
      confirm: showConfirm,
    });
  }, [showConfirm, showToast]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const closeConfirm = (ok: boolean) => {
    const current = confirm;
    setConfirm(null);
    current?.resolve(ok);
  };

  const tone = toast?.tone ?? 'success';
  const icon = iconFor(tone);

  return (
    <>
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[styles.toastWrap, { bottom: Math.max(insets.bottom, 12) + 72 }]}
        >
          <Pressable onPress={hideToast} accessibilityRole="button">
            <Animated.View
              style={[
                styles.toastCard,
                tone === 'error' && styles.toastError,
                tone === 'info' && styles.toastInfo,
                { opacity: toastOpacity, transform: [{ translateY: toastY }] },
              ]}
              testID="app-dialog-toast"
            >
              <View style={[styles.toastIcon, tone === 'error' && styles.toastIconError, tone === 'info' && styles.toastIconInfo]}>
                <Feather name={icon.name} size={18} color={icon.color} />
              </View>
              <View style={styles.toastCopy}>
                <Text style={styles.toastTitle} numberOfLines={2}>
                  {toast.title}
                </Text>
                {toast.message ? (
                  <Text style={styles.toastMessage} numberOfLines={3}>
                    {toast.message}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          </Pressable>
        </View>
      ) : null}

      <ConfirmActionSheet
        visible={Boolean(confirm)}
        onClose={() => closeConfirm(false)}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmText={confirm?.confirmText ?? tr('common.confirm')}
        cancelText={confirm?.cancelText ?? tr('common.cancel')}
        destructive={confirm?.destructive}
        onConfirm={() => closeConfirm(true)}
        testID="app-dialog-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 24,
    alignItems: 'center',
  },
  toastCard: {
    maxWidth: 440,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EDE9F5',
    shadowColor: '#1A1040',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  toastError: { borderColor: '#FECACA' },
  toastInfo: { borderColor: '#DDD6FE' },
  toastIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconError: { backgroundColor: '#FEE2E2' },
  toastIconInfo: { backgroundColor: '#F1EBFF' },
  toastCopy: { flex: 1, minWidth: 0, paddingTop: 2 },
  toastTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: INK,
    letterSpacing: -0.2,
  },
  toastMessage: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
});
