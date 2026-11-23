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

const TOAST_MS = 3200;
const INK = '#1A1040';
const MUTED = '#6B7280';
const PURPLE = '#6A22D6';
const PURPLE_SOFT = '#F1EBFF';
const YELLOW = '#FFCC00';
const SUCCESS = '#059669';
const DANGER = '#DC2626';

function iconFor(tone: AppNotifyTone): { name: keyof typeof Feather.glyphMap; color: string; bg: string } {
  if (tone === 'error') return { name: 'alert-circle', color: DANGER, bg: '#FEE2E2' };
  if (tone === 'info') return { name: 'info', color: PURPLE, bg: PURPLE_SOFT };
  return { name: 'shopping-bag', color: '#FFFFFF', bg: PURPLE };
}

/**
 * Global in-app notify toast + confirm sheet.
 * Brand toast — no native window.alert / window.confirm.
 */
export function AppDialogHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<AppNotifyRequest | null>(null);
  const [confirm, setConfirm] = useState<AppConfirmRequest | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(28)).current;
  const toastScale = useRef(new Animated.Value(0.94)).current;
  const progress = useRef(new Animated.Value(1)).current;
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
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(toastY, {
        toValue: 18,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(toastScale, {
        toValue: 0.96,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [clearHideTimer, toastOpacity, toastScale, toastY]);

  const showToast = useCallback(
    (req: AppNotifyRequest) => {
      clearHideTimer();
      toastSeq.current += 1;
      const seq = toastSeq.current;
      setToast(req);
      toastOpacity.setValue(0);
      toastY.setValue(28);
      toastScale.setValue(0.94);
      progress.setValue(1);
      Animated.parallel([
        Animated.spring(toastOpacity, { toValue: 1, friction: 9, tension: 80, useNativeDriver: true }),
        Animated.spring(toastY, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }),
        Animated.spring(toastScale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
      ]).start();
      Animated.timing(progress, {
        toValue: 0,
        duration: TOAST_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      hideTimer.current = setTimeout(() => {
        if (toastSeq.current === seq) hideToast();
      }, TOAST_MS);
    },
    [clearHideTimer, hideToast, progress, toastOpacity, toastScale, toastY],
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
  const progressColor = tone === 'error' ? DANGER : tone === 'info' ? PURPLE : YELLOW;

  return (
    <>
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[styles.toastWrap, { bottom: Math.max(insets.bottom, 12) + 76 }]}
        >
          <Pressable onPress={hideToast} accessibilityRole="button">
            <Animated.View
              style={[
                styles.toastCard,
                tone === 'error' && styles.toastError,
                {
                  opacity: toastOpacity,
                  transform: [{ translateY: toastY }, { scale: toastScale }],
                },
              ]}
              testID="app-dialog-toast"
            >
              <View style={styles.toastAccent} />
              <View style={[styles.toastIcon, { backgroundColor: icon.bg }]}>
                <Feather name={icon.name} size={18} color={icon.color} />
              </View>
              <View style={styles.toastCopy}>
                <Text style={styles.toastTitle} numberOfLines={1}>
                  {toast.title}
                </Text>
                {toast.message ? (
                  <Text style={styles.toastMessage} numberOfLines={2}>
                    {toast.message}
                  </Text>
                ) : null}
              </View>
              <View style={styles.toastDismiss}>
                <Feather name="x" size={16} color="#94A3B8" />
              </View>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: progressColor,
                      width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
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
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 28,
    alignItems: 'center',
  },
  toastCard: {
    maxWidth: 440,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EDE9F5',
    shadowColor: '#4B248A',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  toastError: { borderColor: '#FECACA' },
  toastAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: PURPLE,
  },
  toastIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  toastCopy: { flex: 1, minWidth: 0 },
  toastTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: INK,
    letterSpacing: -0.25,
  },
  toastMessage: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  toastDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F3F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: '#F3F0F8',
  },
  progressFill: {
    height: 3,
    borderBottomRightRadius: 2,
  },
});
