import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  AUTH_COLORS as C,
  AuthBackdrop,
  AuthButton,
  AuthField,
  AuthFooterLink,
  AuthHeader,
  BrandMark,
  FormError,
  PasswordToggle,
  useEntryAnimation,
} from '@/components/AuthUI';
import { api } from '@/lib/api';
import { localizeError } from '@/lib/i18n/errors';
import { formatLocalPhoneDisplay, isValidLocalPhone, normalizeLocalPhone } from '@/lib/phone';

const PASSWORD_MIN = 6;
const PHONE_MASK = '__ ___ __ __';
const RESEND_COOLDOWN_SEC = 60;

type FieldKey = 'phone' | 'password';

/** Kirish: parol orqali kirish, parolni unutganda SMS orqali tiklash va tezkor SMS kirish. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, t } = useApp();
  const entry = useEntryAnimation();
  const submittingRef = useRef(false);
  const passwordRef = useRef<TextInput>(null);

  // Form states
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  // Forgot password modal states
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPhone, setResetPhone] = useState('');
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetConfirmPass, setResetConfirmPass] = useState('');
  const [showResetNewPass, setShowResetNewPass] = useState(false);
  const [showResetConfirmPass, setShowResetConfirmPass] = useState(false);
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpSending, setResetOtpSending] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const phoneDisplay = useMemo(() => formatLocalPhoneDisplay(phone), [phone]);
  const phoneOk = isValidLocalPhone(phone);
  const passwordOk = password.length >= PASSWORD_MIN;
  const formOk = phoneOk && passwordOk;
  const canSubmit = formOk && !loading && !smsLoading;

  // Countdown timer for OTP resend in reset modal
  useEffect(() => {
    if (resetCountdown <= 0) return;
    const timer = setTimeout(() => setResetCountdown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resetCountdown]);

  // Standard password login
  const submit = async () => {
    if (submittingRef.current || loading || smsLoading) return;
    setError(null);

    const local = normalizeLocalPhone(phone);
    if (local !== phone) setPhone(local);

    const next: Partial<Record<FieldKey, string>> = {};
    if (!isValidLocalPhone(local)) next.phone = t('auth.phoneIncomplete');
    if (password.length < PASSWORD_MIN) next.password = t('auth.passwordTooShort', { min: PASSWORD_MIN });
    setFieldErrors(next);
    if (next.phone || next.password) return;

    submittingRef.current = true;
    setLoading(true);
    try {
      await api.login({ phone: local, password });
      await refresh();
      router.replace('/(tabs)');
    } catch (err: unknown) {
      setError(localizeError(err, t, {
        byStatus: { 401: 'auth.loginInvalidCredentials' },
        fallback: 'auth.loginFailed',
      }));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Fast passwordless SMS OTP login (Uzum/Yandex style)
  const handleFastSmsLogin = async () => {
    if (loading || smsLoading) return;
    setError(null);

    const local = normalizeLocalPhone(phone);
    if (!isValidLocalPhone(local)) {
      setFieldErrors({ phone: t('auth.phoneIncomplete') });
      return;
    }

    setSmsLoading(true);
    try {
      await api.requestOtp(local, 'login');
      router.push({
        pathname: '/verify-otp',
        params: {
          phone: local,
          purpose: 'login',
        },
      });
    } catch (err: unknown) {
      setError(localizeError(err, t, {
        byStatus: {
          404: 'auth.phoneNotRegistered',
          429: 'auth.otpRecentlySent',
          502: 'auth.smsSendFailed',
          503: 'auth.smsSendFailed',
        },
        fallback: 'auth.loginFailed',
      }));
    } finally {
      setSmsLoading(false);
    }
  };

  // Open reset modal and sync phone
  const openResetModal = () => {
    setResetPhone(normalizeLocalPhone(phone));
    setResetOtpCode('');
    setResetNewPass('');
    setResetConfirmPass('');
    setResetOtpSent(false);
    setResetError(null);
    setResetSuccess(false);
    setShowResetModal(true);
  };

  // Step 1: Send SMS OTP for password reset
  const handleSendResetOtp = async () => {
    if (resetOtpSending) return;
    setResetError(null);

    const local = normalizeLocalPhone(resetPhone);
    if (!isValidLocalPhone(local)) {
      setResetError(t('auth.phoneIncomplete'));
      return;
    }

    setResetOtpSending(true);
    try {
      await api.requestOtp(local, 'login');
      setResetOtpSent(true);
      setResetCountdown(RESEND_COOLDOWN_SEC);
    } catch (err: unknown) {
      setResetError(localizeError(err, t, {
        byStatus: {
          404: 'auth.phoneNotRegistered',
          429: 'auth.otpRecentlySent',
          502: 'auth.smsSendFailed',
          503: 'auth.smsSendFailed',
        },
        fallback: 'auth.loginFailed',
      }));
    } finally {
      setResetOtpSending(false);
    }
  };

  // Step 2: Confirm OTP and save new password
  const handleResetSubmit = async () => {
    if (resetSubmitting) return;
    setResetError(null);

    const local = normalizeLocalPhone(resetPhone);
    const safeCode = resetOtpCode.replace(/\D/g, '');

    if (safeCode.length !== 6) {
      setResetError(t('auth.loginResetOtpRequired'));
      return;
    }
    if (resetNewPass.length < PASSWORD_MIN) {
      setResetError(t('auth.passwordTooShort', { min: PASSWORD_MIN }));
      return;
    }
    if (resetNewPass !== resetConfirmPass) {
      setResetError(t('auth.loginResetMismatch'));
      return;
    }

    setResetSubmitting(true);
    try {
      await api.forgotPasswordReset({
        phone: local,
        code: safeCode,
        newPassword: resetNewPass,
      });
      setResetSuccess(true);
      await refresh();
      setTimeout(() => {
        setShowResetModal(false);
        router.replace('/(tabs)');
      }, 500);
    } catch (err: unknown) {
      setResetError(localizeError(err, t, {
        byStatus: {
          400: 'auth.otpInvalid',
          404: 'auth.phoneNotRegistered',
        },
        fallback: 'auth.loginFailed',
      }));
    } finally {
      setResetSubmitting(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

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
        bottomOffset={120}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={entry}>
          <AuthHeader title={t('common.loginAction')} onBack={goBack} backLabel={t('common.back')} />

          <BrandMark size={64} style={styles.brand} />
          <Text style={styles.lead}>{t('auth.loginLead')}</Text>

          <View style={styles.form}>
            <AuthField
              label={t('auth.loginPhoneLabel')}
              prefix="+998"
              prefixA11y={t('auth.phonePrefixA11y')}
              value={phoneDisplay}
              onChangeText={(text) => {
                setPhone(normalizeLocalPhone(text));
                if (fieldErrors.phone) setFieldErrors((e) => ({ ...e, phone: undefined }));
              }}
              keyboardType="number-pad"
              placeholder={PHONE_MASK}
              maxLength={13}
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              editable={!loading && !smsLoading}
              accessibilityLabel={t('auth.phoneA11y')}
              error={fieldErrors.phone}
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="login-phone"
            />
            <AuthField
              ref={passwordRef}
              label={t('auth.passwordLabel')}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
              }}
              secureTextEntry={!showPass}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              editable={!loading && !smsLoading}
              error={fieldErrors.password}
              hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
              onSubmitEditing={() => void submit()}
              accessory={
                <PasswordToggle
                  visible={showPass}
                  onToggle={() => setShowPass((s) => !s)}
                  showLabel={t('auth.passwordShow')}
                  hideLabel={t('auth.passwordHide')}
                />
              }
              testID="login-password"
            />

            {/* Parolni unutdingizmi? */}
            <Pressable
              onPress={openResetModal}
              style={styles.forgotBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('auth.loginForgotPassword')}
            >
              <Text style={styles.forgotText}>{t('auth.loginForgotPassword')}</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.error}>
              <FormError message={error} />
            </View>
          ) : null}

          <AuthButton
            variant="purple"
            label={t('common.loginAction')}
            onPress={() => void submit()}
            loading={loading}
            disabled={!canSubmit}
            style={styles.cta}
            testID="login-submit"
          />

          {/* Uzum / Yandex style divider & Fast SMS OTP Login */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.loginOrDivider')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <AuthButton
            variant="outline"
            label={t('auth.loginWithSmsOtp')}
            onPress={() => void handleFastSmsLogin()}
            loading={smsLoading}
            disabled={loading || smsLoading}
            style={styles.smsBtn}
            testID="login-sms-cta"
          />

          <View style={styles.footer}>
            <AuthFooterLink
              prompt={t('auth.loginNoAccount')}
              action={t('auth.loginRegisterLink')}
              onPress={() => router.push('/register')}
            />
          </View>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>

      {/* Forgot password recovery modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Feather name="shield" size={18} color={C.primary} />
              </View>
              <View style={styles.modalHeaderInfo}>
                <Text style={styles.modalTitle}>{t('auth.loginResetModalTitle')}</Text>
                <Text style={styles.modalSubtitle}>{t('auth.loginResetModalSubtitle')}</Text>
              </View>
              <Pressable
                onPress={() => setShowResetModal(false)}
                hitSlop={8}
                style={styles.modalCloseBtn}
                accessibilityLabel={t('common.close')}
              >
                <Feather name="x" size={20} color={C.secondary} />
              </Pressable>
            </View>

            {!resetOtpSent ? (
              <View style={styles.modalBody}>
                <Text style={styles.modalDesc}>{t('auth.loginResetPhoneNote')}</Text>

                <AuthField
                  label={t('auth.loginPhoneLabel')}
                  prefix="+998"
                  prefixA11y={t('auth.phonePrefixA11y')}
                  value={formatLocalPhoneDisplay(resetPhone)}
                  onChangeText={(text) => {
                    setResetPhone(normalizeLocalPhone(text));
                    if (resetError) setResetError(null);
                  }}
                  keyboardType="number-pad"
                  placeholder={PHONE_MASK}
                  maxLength={13}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  editable={!resetOtpSending}
                  accessibilityLabel={t('auth.phoneA11y')}
                  onSubmitEditing={() => void handleSendResetOtp()}
                  testID="reset-phone-input"
                />

                {resetError ? (
                  <View style={styles.modalErrorWrap}>
                    <FormError message={resetError} />
                  </View>
                ) : null}

                <AuthButton
                  variant="purple"
                  label={t('auth.loginResetGetCode')}
                  onPress={() => void handleSendResetOtp()}
                  loading={resetOtpSending}
                  disabled={!isValidLocalPhone(resetPhone) || resetOtpSending}
                  style={styles.modalCta}
                  testID="reset-send-otp-btn"
                />
              </View>
            ) : (
              <View style={styles.modalBody}>
                <View style={styles.resetPhoneBadge}>
                  <Feather name="phone" size={14} color={C.primary} />
                  <Text style={styles.resetPhoneBadgeText}>
                    {`+998 ${formatLocalPhoneDisplay(resetPhone)}`}
                  </Text>
                </View>

                <AuthField
                  label={t('auth.loginResetOtpLabel')}
                  value={resetOtpCode}
                  onChangeText={(text) => {
                    setResetOtpCode(text.replace(/\D/g, '').slice(0, 6));
                    if (resetError) setResetError(null);
                  }}
                  keyboardType="number-pad"
                  placeholder="000000" // i18n-ignore
                  maxLength={6}
                  returnKeyType="next"
                  editable={!resetSubmitting}
                  accessibilityLabel={t('auth.otpCodeA11y', { length: 6 })}
                  testID="reset-otp-input"
                />

                <AuthField
                  label={t('auth.loginResetNewPassLabel')}
                  value={resetNewPass}
                  onChangeText={(text) => {
                    setResetNewPass(text);
                    if (resetError) setResetError(null);
                  }}
                  secureTextEntry={!showResetNewPass}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  editable={!resetSubmitting}
                  hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
                  accessibilityLabel={t('auth.passwordLabel')}
                  accessory={
                    <PasswordToggle
                      visible={showResetNewPass}
                      onToggle={() => setShowResetNewPass((s) => !s)}
                      showLabel={t('auth.passwordShow')}
                      hideLabel={t('auth.passwordHide')}
                    />
                  }
                  testID="reset-new-password"
                />

                <AuthField
                  label={t('auth.loginResetConfirmPassLabel')}
                  value={resetConfirmPass}
                  onChangeText={(text) => {
                    setResetConfirmPass(text);
                    if (resetError) setResetError(null);
                  }}
                  secureTextEntry={!showResetConfirmPass}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  editable={!resetSubmitting}
                  accessibilityLabel={t('auth.passwordLabel')}
                  onSubmitEditing={() => void handleResetSubmit()}
                  accessory={
                    <PasswordToggle
                      visible={showResetConfirmPass}
                      onToggle={() => setShowResetConfirmPass((s) => !s)}
                      showLabel={t('auth.passwordShow')}
                      hideLabel={t('auth.passwordHide')}
                    />
                  }
                  testID="reset-confirm-password"
                />

                {resetCountdown > 0 ? (
                  <Text style={styles.resetTimerText}>
                    {t('auth.otpResendCountdown', { seconds: resetCountdown })}
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => void handleSendResetOtp()}
                    style={styles.resendBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.otpResend')}
                  >
                    <Text style={styles.resendBtnText}>{t('auth.otpResend')}</Text>
                  </Pressable>
                )}

                {resetError ? (
                  <View style={styles.modalErrorWrap}>
                    <FormError message={resetError} />
                  </View>
                ) : null}

                {resetSuccess ? (
                  <View style={styles.successBanner}>
                    <Feather name="check-circle" size={16} color="#059669" />
                    <Text style={styles.successBannerText}>{t('auth.loginResetSuccess')}</Text>
                  </View>
                ) : null}

                <AuthButton
                  variant="purple"
                  label={t('auth.loginResetSubmit')}
                  onPress={() => void handleResetSubmit()}
                  loading={resetSubmitting}
                  disabled={
                    resetSubmitting ||
                    resetOtpCode.length < 6 ||
                    resetNewPass.length < PASSWORD_MIN ||
                    resetConfirmPass.length < PASSWORD_MIN
                  }
                  style={styles.modalCta}
                  testID="reset-submit-btn"
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.soft, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24 },
  brand: { marginTop: 28 },
  lead: {
    marginTop: 16,
    alignSelf: 'center',
    maxWidth: 320,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: C.secondary,
  },
  form: { marginTop: 24, gap: 14 },
  forgotBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
    marginTop: -2,
  },
  forgotText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: C.primary,
  },
  error: { marginTop: 14 },
  cta: { marginTop: 20 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E0EE',
  },
  dividerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.secondary,
  },
  smsBtn: {
    marginTop: 0,
  },
  footer: { marginTop: 14 },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
      web: { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderInfo: {
    flex: 1,
  },
  modalTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: C.ink,
  },
  modalSubtitle: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    color: C.secondary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    gap: 14,
  },
  modalDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: C.secondary,
  },
  modalErrorWrap: {
    marginTop: 4,
  },
  modalCta: {
    marginTop: 10,
  },
  resetPhoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  resetPhoneBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: C.primary,
  },
  resetTimerText: {
    alignSelf: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: C.secondary,
  },
  resendBtn: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  resendBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    color: C.primary,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  successBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#065F46',
  },
});
