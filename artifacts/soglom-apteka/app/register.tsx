import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
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
  type TextInput as TextInputType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type ApiError } from '@/lib/api';
import {
  formatLocalPhoneDisplay,
  isValidLocalPhone,
  normalizeLocalPhone,
} from '@/lib/phone';
import { setRegisterDraft } from '@/lib/registerDraft';

/** Web autofill ko‘k fonini olib tashlash */
const inputWebFix =
  Platform.OS === 'web'
    ? ({
        outlineStyle: 'none',
        boxShadow: '0 0 0px 1000px #F8F5FC inset',
        WebkitBoxShadow: '0 0 0px 1000px #F8F5FC inset',
        WebkitTextFillColor: '#2A104E',
        caretColor: '#2A104E',
      } as object)
    : ({ outlineStyle: 'none' } as object);

const NAME_MAX = 80;
const PASSWORD_MIN = 6;

type FieldKey = 'name' | 'phone' | 'password';

function mapRegisterError(err: ApiError): { message: string; alreadyRegistered: boolean } {
  const status = err.status;
  const raw = String(err.message || '');
  if (status === 409 || /allaqachon|ro‘yxatdan o‘tgan|royxatdan otgan/i.test(raw)) {
    return {
      message: 'Bu raqam allaqachon ro‘yxatdan o‘tgan. Kirish qiling.',
      alreadyRegistered: true,
    };
  }
  if (status === 429 || /60 soniya|qayta urinib|rate/i.test(raw)) {
    return {
      message: 'Kod allaqachon yuborilgan. 60 soniyadan keyin qayta urinib ko‘ring.',
      alreadyRegistered: false,
    };
  }
  if (status === 503 || /sms|eskiz|yuborilmadi/i.test(raw)) {
    return {
      message: raw || 'SMS yuborib bo‘lmadi. Keyinroq qayta urinib ko‘ring.',
      alreadyRegistered: false,
    };
  }
  if (!status && /Serverga ulanib|network|Failed to fetch/i.test(raw)) {
    return {
      message: 'Serverga ulanib bo‘lmadi. Internet yoki API holatini tekshiring.',
      alreadyRegistered: false,
    };
  }
  return {
    message: raw || 'Xatolik yuz berdi. Qayta urinib ko‘ring.',
    alreadyRegistered: false,
  };
}

/** Ro‘yxat: ism + telefon + parol → SMS tasdiq (OTP). Auth shartnomasi o‘zgarmaydi. */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const phoneRef = useRef<TextInputType>(null);
  const passwordRef = useRef<TextInputType>(null);
  const submittingRef = useRef(false);

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [focused, setFocused] = useState<FieldKey | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const nameOk = firstName.trim().length >= 2 && firstName.trim().length <= NAME_MAX;
  const phoneOk = isValidLocalPhone(phone);
  const passwordOk = password.length >= PASSWORD_MIN;
  const formOk = nameOk && phoneOk && passwordOk;
  const canSubmit = formOk && !loading;

  const phoneDisplay = useMemo(() => formatLocalPhoneDisplay(phone), [phone]);

  const fieldBorder = (key: FieldKey) => {
    if (fieldErrors[key]) return '#F87171';
    if (focused === key) return '#5C328E';
    return '#EDE4F7';
  };

  const validateLocal = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {};
    const name = firstName.trim();
    if (name.length < 2) next.name = 'Ismingizni kiriting (kamida 2 belgi)';
    else if (name.length > NAME_MAX) next.name = `Ism ${NAME_MAX} belgidan oshmasin`;
    if (!isValidLocalPhone(phone)) {
      next.phone = 'Telefon raqamni to‘liq kiriting (9 raqam).';
    }
    if (password.length < PASSWORD_MIN) {
      next.password = `Parol kamida ${PASSWORD_MIN} ta belgi bo‘lsin`;
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
      const mapped = mapRegisterError(err as ApiError);
      setAlreadyRegistered(mapped.alreadyRegistered);
      setError(mapped.message);
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
              paddingBottom: Math.max(insets.bottom, 16) + 28,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <Pressable
              onPress={goBack}
              style={styles.back}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Orqaga"
            >
              <Feather name="chevron-left" size={20} color="#FFCC00" />
            </Pressable>
          </View>

          <Text style={styles.brand}>YANGI HISOB</Text>
          <Text style={styles.hello}>Ro‘yxatdan o‘ting</Text>
          <Text style={styles.lead}>
            Telefon SMS bilan tasdiqlanadi. Keyin shu parol bilan kirasiz.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label} accessibilityRole="text">
              Ismingiz
            </Text>
            <View style={[styles.field, { borderColor: fieldBorder('name') }]}>
              <View style={styles.fieldIcon}>
                <Feather name="user" size={16} color="#5C328E" />
              </View>
              <TextInput
                value={firstName}
                onChangeText={(t) => {
                  setFirstName(t);
                  if (fieldErrors.name) setFieldErrors((e) => ({ ...e, name: undefined }));
                }}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                placeholder="Ismingiz"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                autoComplete="given-name"
                textContentType="givenName"
                autoCapitalize="words"
                returnKeyType="next"
                maxLength={NAME_MAX}
                editable={!loading}
                accessibilityLabel="Ismingiz"
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
            </View>
            {fieldErrors.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}

            <Text style={[styles.label, { marginTop: 14 }]}>Telefon</Text>
            <View style={[styles.field, { borderColor: fieldBorder('phone') }]}>
              <View style={styles.fieldIcon}>
                <Feather name="smartphone" size={16} color="#5C328E" />
              </View>
              <Text style={styles.prefix} accessibilityLabel="Mamlakat kodi plus 998">
                +998
              </Text>
              <TextInput
                ref={phoneRef}
                value={phoneDisplay}
                onChangeText={(t) => {
                  setPhone(normalizeLocalPhone(t));
                  if (fieldErrors.phone) setFieldErrors((e) => ({ ...e, phone: undefined }));
                }}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                keyboardType="number-pad"
                placeholder="Telefon raqamingiz"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                maxLength={13}
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="next"
                editable={!loading}
                accessibilityLabel="Telefon raqam"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
            {fieldErrors.phone ? <Text style={styles.fieldError}>{fieldErrors.phone}</Text> : null}

            <Text style={[styles.label, { marginTop: 14 }]}>Parol (keyin kirish uchun)</Text>
            <View style={[styles.field, { borderColor: fieldBorder('password') }]}>
              <View style={styles.fieldIcon}>
                <Feather name="lock" size={16} color="#5C328E" />
              </View>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
                }}
                onFocus={() => {
                  setFocused('password');
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                }}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPass}
                placeholder="Parolni kiriting"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                editable={!loading}
                // Do not trim — backend counts raw length including spaces
                accessibilityLabel="Parol"
                onSubmitEditing={() => void submit()}
              />
              <Pressable
                onPress={() => setShowPass((v) => !v)}
                hitSlop={10}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPass ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
              >
                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
              </Pressable>
            </View>
            <Text style={styles.hint}>Kamida {PASSWORD_MIN} belgi</Text>
            {fieldErrors.password ? (
              <Text style={styles.fieldError}>{fieldErrors.password}</Text>
            ) : null}

            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Feather name="alert-circle" size={16} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {alreadyRegistered ? (
              <Pressable
                onPress={() => router.push('/login')}
                style={styles.btnLoginAlt}
                accessibilityRole="button"
                accessibilityLabel="Kirish sahifasiga o‘tish"
              >
                <Text style={styles.btnLoginAltText}>Kirish sahifasiga o‘tish</Text>
                <Feather name="arrow-right" size={16} color="#5C328E" />
              </Pressable>
            ) : null}

            <Pressable
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={[styles.btn, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="SMS kodni olish"
              accessibilityState={{ disabled: !canSubmit, busy: loading }}
            >
              {canSubmit ? (
                <LinearGradient colors={['#FFCC00', '#F0B800']} style={styles.btnGrad}>
                  {loading ? (
                    <ActivityIndicator color="#120724" />
                  ) : (
                    <>
                      <Text style={styles.btnText}>SMS kodni olish</Text>
                      <Feather name="arrow-right" size={18} color="#120724" />
                    </>
                  )}
                </LinearGradient>
              ) : (
                <View style={[styles.btnGrad, styles.btnGradDisabled]}>
                  <Text style={styles.btnTextDisabled}>SMS kodni olish</Text>
                  <Feather name="arrow-right" size={18} color="#A8B0C0" />
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Allaqachon hisobingiz bormi?</Text>
            <Pressable
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel="Kirish"
            >
              <Text style={styles.footerLink}> Kirish</Text>
            </Pressable>
          </View>

          {/* No privacy/terms URLs configured in the app — text only, no fake links */}
          <Text style={styles.legal}>
            Davom etib, maxfiylik siyosati va foydalanish shartlariga rozilik bildirasiz.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: '100%', backgroundColor: '#F7F5F2', overflow: 'hidden' },
  flex: { flex: 1 },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  scrollView: { flex: 1, width: '100%' },
  scroll: {
    paddingLeft: 20,
    paddingRight: 20,
    flexGrow: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: '#FFCC00',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  hello: {
    marginTop: 8,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    lineHeight: 34,
  },
  lead: {
    marginTop: 8,
    marginBottom: 18,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
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
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#5C328E',
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F5FC',
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 12,
    borderWidth: 1.5,
  },
  fieldIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  prefix: { fontFamily: 'Inter_700Bold', color: '#2A104E', fontSize: 15, flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#2A104E',
    minHeight: 44,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  eyeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fieldError: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
  },
  hint: {
    marginTop: 6,
    marginBottom: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#94A3B8',
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
  },
  btnLoginAlt: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#5C328E',
    backgroundColor: '#F8F5FC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnLoginAltText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#5C328E' },
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' },
  footerMuted: { fontFamily: 'Inter_400Regular', color: '#64748B', fontSize: 14 },
  footerLink: { fontFamily: 'Inter_700Bold', color: '#5C328E', fontSize: 14 },
  legal: {
    textAlign: 'center',
    marginTop: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});
