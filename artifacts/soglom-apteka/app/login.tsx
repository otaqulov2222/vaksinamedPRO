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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api, type ApiError } from '@/lib/api';
import {
  formatLocalPhoneDisplay,
  isValidLocalPhone,
  normalizeLocalPhone,
} from '@/lib/phone';

const PASSWORD_MIN = 6;

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

function mapLoginError(err: ApiError): string {
  const status = err.status;
  const raw = String(err.message || '');
  if (!status && /Serverga ulanib|network|Failed to fetch/i.test(raw)) {
    return 'Serverga ulanib bo‘lmadi. Internet yoki API holatini tekshiring.';
  }
  if (status === 429) {
    return 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.';
  }
  if (status === 401 || /noto‘g‘ri|parol|telefon/i.test(raw)) {
    return 'Telefon yoki parol noto‘g‘ri';
  }
  return raw || 'Kirish amalga oshmadi. Qayta urinib ko‘ring.';
}

/** Kirish: telefon + parol (SMS faqat ro‘yxatda). Auth arxitekturasi o‘zgarmaydi. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useApp();
  const submittingRef = useRef(false);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (!isValidLocalPhone(local)) {
      setError('Telefon raqamni to‘liq kiriting (9 raqam).');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Parol kamida ${PASSWORD_MIN} belgi`);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      await api.login({ phone: local, password });
      await refresh();
      router.replace('/(tabs)');
    } catch (err: unknown) {
      setError(mapLoginError(err as ApiError));
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
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 8) + 4,
              paddingBottom: Math.max(insets.bottom, 16) + 28,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
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

          <Text style={styles.brand}>VAKSINA MED</Text>
          <Text style={styles.hello}>Hisobga kirish</Text>
          <Text style={styles.lead}>Ro‘yxatdan o‘tgan telefon va parolingiz bilan kiring</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Telefon (login)</Text>
            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <Feather name="smartphone" size={16} color="#5C328E" />
              </View>
              <Text style={styles.prefix} accessibilityLabel="Mamlakat kodi plus 998">
                +998
              </Text>
              <TextInput
                value={phoneDisplay}
                onChangeText={(t) => setPhone(normalizeLocalPhone(t))}
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
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Parol</Text>
            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <Feather name="lock" size={16} color="#5C328E" />
              </View>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                placeholder="Parolni kiriting"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                editable={!loading}
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

            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Feather name="alert-circle" size={16} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={[styles.btn, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Kirish"
              accessibilityState={{ disabled: !canSubmit, busy: loading }}
            >
              {canSubmit || loading ? (
                <LinearGradient colors={['#FFCC00', '#F0B800']} style={styles.btnGrad}>
                  {loading ? (
                    <ActivityIndicator color="#120724" />
                  ) : (
                    <>
                      <Text style={styles.btnText}>Kirish</Text>
                      <Feather name="arrow-right" size={18} color="#120724" />
                    </>
                  )}
                </LinearGradient>
              ) : (
                <View style={[styles.btnGrad, styles.btnGradDisabled]}>
                  <Text style={styles.btnTextDisabled}>Kirish</Text>
                  <Feather name="arrow-right" size={18} color="#A8B0C0" />
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Hisobingiz yo‘qmi?</Text>
            <Pressable
              onPress={() => router.push('/register')}
              accessibilityRole="button"
              accessibilityLabel="Ro‘yxatdan o‘ting"
            >
              <Text style={styles.footerLink}> Ro‘yxatdan o‘ting</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    backgroundColor: '#F7F5F2',
    overflow: 'hidden',
  },
  flex: { flex: 1, width: '100%' },
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
    borderWidth: 1,
    borderColor: '#EDE4F7',
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
  hint: {
    marginTop: 6,
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
    minWidth: 0,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
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
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 },
  footerMuted: { fontFamily: 'Inter_400Regular', color: '#64748B', fontSize: 14 },
  footerLink: { fontFamily: 'Inter_700Bold', color: '#5C328E', fontSize: 14 },
});
