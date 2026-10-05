import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  AUTH_COLORS as C,
  AuthBackdrop,
  AuthButton,
  AuthHeader,
  BrandMark,
  FormError,
  useEntryAnimation,
} from '@/components/AuthUI';
import { api } from '@/lib/api';
import { localizeError } from '@/lib/i18n/errors';
import { formatLocalPhoneMasked, normalizeLocalPhone } from '@/lib/phone';
import { clearRegisterDraft, peekRegisterDraft } from '@/lib/registerDraft';

const OTP_LEN = 6;
/** UI countdown aligned with existing server 60s recent-OTP gate — do not invent a new value. */
const RESEND_COOLDOWN_SEC = 60;
const FIELD_EDGE = '#E5E0EE';

const inputWebFix = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/**
 * OTP verify — visual/security polish only.
 * Server remains authoritative; no TTL/hash/rate-limit changes.
 */
export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, t } = useApp();
  const entry = useEntryAnimation();
  const params = useLocalSearchParams<{
    phone?: string;
    purpose?: string;
    firstName?: string;
  }>();

  const phoneLocal = useMemo(
    () => normalizeLocalPhone(String(params.phone || '')),
    [params.phone],
  );
  const phoneLabel = useMemo(
    () => (phoneLocal ? `+998 ${formatLocalPhoneMasked(phoneLocal)}` : '+998'),
    [phoneLocal],
  );
  const purpose = params.purpose === 'register' ? 'register' : 'login';
  const firstName = String(params.firstName || '');

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_COOLDOWN_SEC);
  const [error, setError] = useState<string | null>(null);
  const [resendOk, setResendOk] = useState(false);
  const [focused, setFocused] = useState(false);

  const verifyingRef = useRef(false);
  const resendingRef = useRef(false);

  const codeComplete = code.length === OTP_LEN;
  const busy = verifying || resending;
  const canVerify = codeComplete && !busy;

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const onChangeCode = (raw: string) => {
    const next = String(raw || '').replace(/\D/g, '').slice(0, OTP_LEN);
    setCode(next);
    setResendOk(false);
    if (error) setError(null);
  };

  const verify = async () => {
    if (verifyingRef.current || busy) return;
    setError(null);
    setResendOk(false);
    if (!codeComplete) {
      setError(t('auth.otpEnterCode', { length: OTP_LEN }));
      return;
    }
    if (!phoneLocal) {
      setError(t('auth.otpPhoneMissing'));
      return;
    }

    verifyingRef.current = true;
    setVerifying(true);
    try {
      const draft = purpose === 'register' ? peekRegisterDraft() : null;
      await api.verifyOtp({
        phone: phoneLocal,
        code,
        purpose,
        firstName: purpose === 'register' ? firstName || draft?.firstName : undefined,
        password: purpose === 'register' ? draft?.password : undefined,
      });
      if (purpose === 'register') clearRegisterDraft();
      await refresh();
      router.replace('/(tabs)');
    } catch (err: unknown) {
      setError(localizeError(err, t, {
        byStatus: {
          401: 'auth.otpInvalid',
          409: 'auth.phoneTaken',
        },
        fallback: 'auth.otpVerifyFailed',
      }));
    } finally {
      setVerifying(false);
      verifyingRef.current = false;
    }
  };

  const resend = async () => {
    if (seconds > 0 || resendingRef.current || busy) return;
    if (!phoneLocal) {
      setError(t('auth.otpPhoneMissing'));
      return;
    }
    setError(null);
    setResendOk(false);
    resendingRef.current = true;
    setResending(true);
    try {
      await api.requestOtp(phoneLocal, purpose);
      setSeconds(RESEND_COOLDOWN_SEC);
      setResendOk(true);
    } catch (err: unknown) {
      setError(localizeError(err, t, {
        byStatus: {
          404: 'auth.phoneNotRegistered',
          409: 'auth.phoneTaken',
          429: 'auth.otpRecentlySent',
          502: 'auth.smsSendFailed',
          503: 'auth.smsSendFailed',
        },
        fallback: 'auth.otpResendFailed',
      }));
    } finally {
      setResending(false);
      resendingRef.current = false;
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(purpose === 'register' ? '/register' : '/login');
  };

  const resendDisabled = seconds > 0 || busy;

  return (
    <View style={styles.root}>
      <AuthBackdrop variant="quiet" />
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? 16 : Math.max(insets.top, 12) + 4,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          },
        ]}
        bottomOffset={140}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={entry}>
          <AuthHeader title={t('auth.otpTitle')} onBack={goBack} backLabel={t('common.back')} />

          <BrandMark size={56} style={styles.brand} />
          <Text style={styles.lead}>
            {t('auth.otpSubtitle', { phone: phoneLabel.replace(/ /g, '\u00A0'), length: OTP_LEN })}
          </Text>

          <TextInput
            value={code}
            onChangeText={onChangeCode}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            placeholder="• • • • • •"
            placeholderTextColor="rgba(75,36,138,0.3)"
            style={[
              styles.codeInput,
              inputWebFix,
              { borderColor: error ? C.danger : focused ? C.primary : FIELD_EDGE },
              focused && !error && styles.codeFocused,
            ]}
            maxLength={OTP_LEN}
            autoFocus
            editable={!verifying}
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            importantForAutofill="yes"
            accessibilityLabel={t('auth.otpCodeA11y', { length: OTP_LEN })}
            onSubmitEditing={() => {
              if (canVerify) void verify();
            }}
          />

          {error ? (
            <View style={styles.message}>
              <FormError message={error} />
            </View>
          ) : null}

          {resendOk && !error ? (
            <Text style={styles.resendOk} accessibilityLiveRegion="polite">
              {t('auth.otpResent')}
            </Text>
          ) : null}

          <AuthButton
            variant="purple"
            label={t('common.confirm')}
            onPress={() => void verify()}
            loading={verifying}
            disabled={!canVerify}
            style={styles.cta}
          />

          <Pressable
            disabled={resendDisabled}
            onPress={() => void resend()}
            style={styles.resend}
            accessibilityRole="button"
            accessibilityLabel={
              seconds > 0
                ? t('auth.otpResendCountdownA11y', { seconds })
                : t('auth.otpResend')
            }
            accessibilityState={{ disabled: resendDisabled, busy: resending }}
          >
            {resending ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <Text style={[styles.resendText, resendDisabled && styles.resendMuted]}>
                {seconds > 0
                  ? t('auth.otpResendCountdown', { seconds })
                  : t('auth.otpResend')}
              </Text>
            )}
          </Pressable>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.soft, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24 },
  brand: { marginTop: 24 },
  lead: {
    marginTop: 14,
    marginBottom: 24,
    alignSelf: 'center',
    maxWidth: 320,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: C.secondary,
  },
  codeInput: {
    minHeight: 64,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: C.surface,
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    color: C.ink,
  },
  codeFocused: { boxShadow: '0px 0px 0px 3px rgba(75,36,138,0.10)' },
  message: { marginTop: 16 },
  resendOk: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: '#16A34A',
  },
  cta: { marginTop: 24 },
  resend: { marginTop: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resendText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: C.primary },
  resendMuted: { color: C.secondary },
});
