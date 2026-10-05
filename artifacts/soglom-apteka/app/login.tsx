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
import { api } from '@/lib/api';
import { localizeError } from '@/lib/i18n/errors';
import { formatLocalPhoneDisplay, isValidLocalPhone, normalizeLocalPhone } from '@/lib/phone';

const PASSWORD_MIN = 6;
const PHONE_MASK = '__ ___ __ __';

type FieldKey = 'phone' | 'password';

/** Kirish: telefon + parol (SMS faqat ro‘yxatda). Auth arxitekturasi o‘zgarmaydi. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, t } = useApp();
  const entry = useEntryAnimation();
  const submittingRef = useRef(false);
  const passwordRef = useRef<TextInput>(null);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const phoneDisplay = useMemo(() => formatLocalPhoneDisplay(phone), [phone]);
  const phoneOk = isValidLocalPhone(phone);
  const passwordOk = password.length >= PASSWORD_MIN;
  const formOk = phoneOk && passwordOk;
  const canSubmit = formOk && !loading;

  const submit = async () => {
    if (submittingRef.current || loading) return;
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
              editable={!loading}
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
              editable={!loading}
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

          <View style={styles.footer}>
            <AuthFooterLink
              prompt={t('auth.loginNoAccount')}
              action={t('auth.loginRegisterLink')}
              onPress={() => router.push('/register')}
            />
          </View>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
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
  form: { marginTop: 28, gap: 16 },
  error: { marginTop: 16 },
  cta: { marginTop: 24 },
  footer: { marginTop: 12 },
});
