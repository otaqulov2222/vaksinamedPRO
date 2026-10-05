import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { api, type ApiError } from '@/lib/api';
import { localizeError } from '@/lib/i18n/errors';
import { formatLocalPhoneDisplay, isValidLocalPhone, normalizeLocalPhone } from '@/lib/phone';
import { setRegisterDraft } from '@/lib/registerDraft';

const NAME_MIN = 2;
const NAME_MAX = 80;
const PASSWORD_MIN = 6;
const PHONE_MASK = '__ ___ __ __';

type FieldKey = 'name' | 'phone' | 'password';

/** Ro‘yxat: ism + telefon + parol → SMS tasdiq (OTP). Auth shartnomasi o‘zgarmaydi. */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const entry = useEntryAnimation();
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const nameOk = firstName.trim().length >= NAME_MIN && firstName.trim().length <= NAME_MAX;
  const phoneOk = isValidLocalPhone(phone);
  const passwordOk = password.length >= PASSWORD_MIN;
  const formOk = nameOk && phoneOk && passwordOk;
  const canSubmit = formOk && !loading;

  const phoneDisplay = useMemo(() => formatLocalPhoneDisplay(phone), [phone]);

  const clearFieldError = (key: FieldKey) => {
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validateLocal = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {};
    const name = firstName.trim();
    if (name.length < NAME_MIN) next.name = t('auth.registerNameTooShort', { min: NAME_MIN });
    else if (name.length > NAME_MAX) next.name = t('auth.registerNameTooLong', { max: NAME_MAX });
    if (!isValidLocalPhone(phone)) {
      next.phone = t('auth.phoneIncomplete');
    }
    if (password.length < PASSWORD_MIN) {
      next.password = t('auth.passwordTooShort', { min: PASSWORD_MIN });
    }
    setFieldErrors(next);
    if (Object.keys(next).length) {
      setError(null);
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (submittingRef.current || loading) return;
    setError(null);
    setAlreadyRegistered(false);

    const local = normalizeLocalPhone(phone);
    if (local !== phone) setPhone(local);

    if (!validateLocal()) return;

    submittingRef.current = true;
    setLoading(true);
    try {
      await api.requestOtp(local, 'register');
      // Draft holds password off the URL; OTP verify reads it.
      setRegisterDraft({
        phone: local,
        firstName: firstName.trim(),
        password,
      });
      router.push({
        pathname: '/verify-otp',
        params: {
          phone: local,
          purpose: 'register',
          firstName: firstName.trim(),
        },
      });
    } catch (err: unknown) {
      setAlreadyRegistered((err as ApiError)?.status === 409);
      setError(localizeError(err, t, {
        byStatus: {
          409: 'auth.phoneTaken',
          429: 'auth.otpRecentlySent',
          502: 'auth.smsSendFailed',
          503: 'auth.smsSendFailed',
        },
        fallback: 'auth.registerFailed',
      }));
    } finally {
      setLoading(false);
      submittingRef.current = false;
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
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={entry}>
          <AuthHeader title={t('auth.registerAction')} onBack={goBack} backLabel={t('common.back')} />

          <BrandMark size={56} style={styles.brand} />
          <Text style={styles.lead}>{t('auth.registerLead')}</Text>

          <View style={styles.form}>
            <AuthField
              label={t('auth.registerNameLabel')}
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                clearFieldError('name');
              }}
              placeholder={t('auth.registerNameLabel')}
              autoComplete="given-name"
              textContentType="givenName"
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={NAME_MAX}
              editable={!loading}
              error={fieldErrors.name}
              onSubmitEditing={() => phoneRef.current?.focus()}
              testID="register-name"
            />
            <AuthField
              ref={phoneRef}
              label={t('auth.registerPhoneLabel')}
              prefix="+998"
              prefixA11y={t('auth.phonePrefixA11y')}
              value={phoneDisplay}
              onChangeText={(text) => {
                setPhone(normalizeLocalPhone(text));
                clearFieldError('phone');
              }}
              keyboardType="number-pad"
              placeholder={PHONE_MASK}
              maxLength={13}
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              editable={!loading}
              accessibilityLabel={t('auth.phoneA11y')}
              error={fieldErrors.phone}
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="register-phone"
            />
            <AuthField
              ref={passwordRef}
              label={t('auth.registerPasswordLabel')}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearFieldError('password');
              }}
              secureTextEntry={!showPass}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              editable={!loading}
              // Do not trim — backend counts raw length including spaces
              accessibilityLabel={t('auth.passwordLabel')}
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
              testID="register-password"
            />
          </View>

          {error ? (
            <View style={styles.error}>
              <FormError message={error} />
            </View>
          ) : null}

          {alreadyRegistered ? (
            <AuthButton
              variant="outline"
              label={t('auth.registerGoToLogin')}
              onPress={() => router.push('/login')}
              style={styles.altCta}
            />
          ) : null}

          <AuthButton
            variant="purple"
            label={t('auth.registerGetCode')}
            onPress={() => void submit()}
            loading={loading}
            disabled={!canSubmit}
            style={styles.cta}
            testID="register-submit"
          />

          <View style={styles.footer}>
            <AuthFooterLink
              prompt={t('auth.registerHaveAccount')}
              action={t('common.loginAction')}
              onPress={() => router.push('/login')}
            />
          </View>

          {/* No privacy/terms URLs configured in the app — text only, no fake links */}
          <Text style={styles.legal}>{t('auth.registerLegal')}</Text>
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
    alignSelf: 'center',
    maxWidth: 330,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: C.secondary,
  },
  form: { marginTop: 24, gap: 16 },
  error: { marginTop: 16 },
  altCta: { marginTop: 12 },
  cta: { marginTop: 24 },
  footer: { marginTop: 12 },
  legal: {
    marginTop: 4,
    alignSelf: 'center',
    maxWidth: 320,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    color: C.secondary,
  },
});
