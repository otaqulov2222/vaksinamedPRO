import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api, type ApiError } from '@/lib/api';
import { formatLocalPhoneMasked, normalizeLocalPhone } from '@/lib/phone';
import { clearRegisterDraft, peekRegisterDraft } from '@/lib/registerDraft';

const OTP_LEN = 6;
/** UI countdown aligned with existing server 60s recent-OTP gate — do not invent a new value. */
const RESEND_COOLDOWN_SEC = 60;

const inputWebFix =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'none' } as object)
    : ({ outlineStyle: 'none' } as object);

function mapOtpError(err: ApiError, kind: 'verify' | 'resend'): string {
  const status = err.status;
  const raw = String(err.message || '');
  if (status === 429 || /60 soniya|qayta urinib|rate/i.test(raw)) {
    return 'Kod allaqachon yuborilgan. 60 soniyadan keyin qayta urinib ko‘ring.';
  }
  if (status === 503 || status === 502 || /sms|eskiz|yuborilmadi|provider/i.test(raw)) {
    return 'SMS yuborib bo‘lmadi. Keyinroq qayta urinib ko‘ring.';
  }
  if (!status && /Serverga ulanib|network|Failed to fetch/i.test(raw)) {
    return 'Serverga ulanib bo‘lmadi. Internet yoki API holatini tekshiring.';
  }
  if (kind === 'verify') {
    if (status === 401 || /noto‘g‘ri|muddati|expired|invalid/i.test(raw)) {
      return 'Kod noto‘g‘ri yoki muddati tugagan';
    }
    return 'Tasdiqlash amalga oshmadi. Qayta urinib ko‘ring.';
  }
  return 'Kodni qayta yuborib bo‘lmadi. Qayta urinib ko‘ring.';
}

/**
 * OTP verify — visual/security polish only.
 * Server remains authoritative; no TTL/hash/rate-limit changes.
 */
export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useApp();
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
  const scrollRef = useRef<ScrollView>(null);

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
      setError('6 xonali kodni kiriting');
      return;
    }
    if (!phoneLocal) {
      setError('Telefon raqam topilmadi. Orqaga qaytib qayta urinib ko‘ring.');
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
      setError(mapOtpError(err as ApiError, 'verify'));
    } finally {
      setVerifying(false);
      verifyingRef.current = false;
    }
  };

  const resend = async () => {
    if (seconds > 0 || resendingRef.current || busy) return;
    if (!phoneLocal) {
      setError('Telefon raqam topilmadi. Orqaga qaytib qayta urinib ko‘ring.');
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
      setError(mapOtpError(err as ApiError, 'resend'));
    } finally {
      setResending(false);
      resendingRef.current = false;
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(purpose === 'register' ? '/register' : '/login');
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2A104E', '#4A2878', '#F7F5F2']} style={styles.hero} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 8) + 4,
              paddingBottom: Math.max(insets.bottom, 16) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={goBack}
            style={styles.back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Orqaga"
          >
            <Feather name="chevron-left" size={20} color="#FFCC00" />
          </Pressable>

          <Text style={styles.title}>SMS kod</Text>
          <Text style={styles.sub}>
            {phoneLabel} raqamiga yuborilgan {OTP_LEN} xonali kodni kiriting
          </Text>

          <View style={styles.cardWrap}>
            <View style={styles.card}>
              <TextInput
                value={code}
                onChangeText={onChangeCode}
                onFocus={() => {
                  setFocused(true);
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
                }}
                onBlur={() => setFocused(false)}
                keyboardType="number-pad"
                placeholder="• • • • • •"
                placeholderTextColor="#C4B5D6"
                style={[
                  styles.codeInput,
                  inputWebFix,
                  { borderColor: error ? '#F87171' : focused ? '#5C328E' : '#EDE4F7' },
                ]}
                maxLength={OTP_LEN}
                autoFocus
                editable={!verifying}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                importantForAutofill="yes"
                accessibilityLabel={`${OTP_LEN} xonali SMS kod`}
                onSubmitEditing={() => {
                  if (canVerify) void verify();
                }}
              />

              {error ? (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <Feather name="alert-circle" size={16} color="#B91C1C" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {resendOk && !error ? (
                <Text style={styles.resendOk} accessibilityLiveRegion="polite">
                  Yangi kod yuborildi
                </Text>
              ) : null}

              <Pressable
                disabled={!canVerify}
                onPress={() => void verify()}
                style={[styles.btn, !canVerify && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Tasdiqlash"
                accessibilityState={{ disabled: !canVerify, busy: verifying }}
              >
                {canVerify || verifying ? (
                  <LinearGradient colors={['#FFCC00', '#F0B800']} style={styles.btnGrad}>
                    {verifying ? (
                      <ActivityIndicator color="#120724" />
                    ) : (
                      <>
                        <Text style={styles.btnText}>Tasdiqlash</Text>
                        <Feather name="arrow-right" size={18} color="#120724" />
                      </>
                    )}
                  </LinearGradient>
                ) : (
                  <View style={[styles.btnGrad, styles.btnGradDisabled]}>
                    <Text style={styles.btnTextDisabled}>Tasdiqlash</Text>
                    <Feather name="arrow-right" size={18} color="#A8B0C0" />
                  </View>
                )}
              </Pressable>

              <Pressable
                disabled={seconds > 0 || busy}
                onPress={() => void resend()}
                style={styles.resend}
                accessibilityRole="button"
                accessibilityLabel={
                  seconds > 0
                    ? `Qayta yuborish ${seconds} soniyadan keyin`
                    : 'Kodni qayta yuborish'
                }
                accessibilityState={{ disabled: seconds > 0 || busy, busy: resending }}
              >
                {resending ? (
                  <ActivityIndicator color="#5C328E" />
                ) : (
                  <Text style={[styles.resendText, (seconds > 0 || busy) && styles.resendMuted]}>
                    {seconds > 0 ? `Qayta yuborish: ${seconds}s` : 'Kodni qayta yuborish'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', backgroundColor: '#F7F5F2', overflow: 'hidden' },
  flex: { flex: 1 },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  scrollView: { flex: 1, width: '100%' },
  scroll: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 26 },
  sub: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 20,
  },
  cardWrap: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#2A104E',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  codeInput: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    color: '#2A104E',
    backgroundColor: '#F8F5FC',
    borderRadius: 16,
    minHeight: 64,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  errorBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
    textAlign: 'left',
  },
  resendOk: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#0D9488',
  },
  btn: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  btnDisabled: { opacity: 1 },
  btnGrad: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnGradDisabled: {
    backgroundColor: '#E8E4F0',
  },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#120724' },
  btnTextDisabled: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#94A3B8' },
  resend: {
    marginTop: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  resendText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#5C328E' },
  resendMuted: { color: '#94A3B8' },
});
