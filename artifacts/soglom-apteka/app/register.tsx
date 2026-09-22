import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { api } from '@/lib/api';
import { isValidLocalPhone, normalizeLocalPhone } from '@/lib/phone';

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

/** Ro‘yxat: ism + telefon + parol → SMS tasdiq */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const showError = (msg: string) => {
    setError(msg);
    if (Platform.OS !== 'web') Alert.alert('Ro‘yxatdan o‘tish', msg);
  };

  const submit = async () => {
    setError(null);
    setAlreadyRegistered(false);
    const local = normalizeLocalPhone(phone);
    if (local !== phone) setPhone(local);

    if (firstName.trim().length < 2) {
      showError('Ismingizni kiriting');
      return;
    }
    if (!isValidLocalPhone(local)) {
      showError('Telefon raqamni to‘liq kiriting (9 raqam). Masalan: 90 123 45 67');
      return;
    }
    if (password.length < 6) {
      showError('Parol kamida 6 ta belgi bo‘lsin');
      return;
    }
    setLoading(true);
    try {
      const data = await api.requestOtp(local, 'register');
      const { setRegisterDraft } = await import('@/lib/registerDraft');
      setRegisterDraft({ phone: local, firstName: firstName.trim(), password });
      router.push({
        pathname: '/verify-otp',
        params: {
          phone: local,
          purpose: 'register',
          firstName: firstName.trim(),
          ...( __DEV__ && data.devCode ? { hint: data.devCode } : {}),
        },
      });
    } catch (err: any) {
      const msg = err?.message || 'Xatolik yuz berdi';
      if (err?.status === 409 || /allaqachon|ro‘yxatdan o‘tgan|royxatdan otgan/i.test(msg)) {
        setAlreadyRegistered(true);
        setError('Bu raqam allaqachon ro‘yxatdan o‘tgan. Kirish qiling.');
      } else {
        showError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2A104E', '#4A2878', '#F7F5F2']} style={styles.hero} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/welcome');
              }}
              style={styles.back}
              hitSlop={8}
            >
              <Feather name="chevron-left" size={20} color="#FFCC00" />
            </Pressable>
            <Image
              source={require('../assets/images/vaksina-mark-clean.png')}
              style={styles.logoMark}
              resizeMode="contain"
            />
            <View style={styles.topSpacer} />
          </View>

          <Text style={styles.brand}>YANGI HISOB</Text>
          <Text style={styles.hello}>Ro‘yxatdan o‘ting</Text>
          <Text style={styles.lead}>
            Telefon SMS bilan tasdiqlanadi. Keyin shu parol bilan kirasiz.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Ismingiz</Text>
            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <Feather name="user" size={16} color="#5C328E" />
              </View>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Firdavs"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                autoComplete="given-name"
                textContentType="givenName"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Telefon</Text>
            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <Feather name="smartphone" size={16} color="#5C328E" />
              </View>
              <Text style={styles.prefix}>+998</Text>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(normalizeLocalPhone(t))}
                keyboardType="number-pad"
                placeholder="90 123 45 67"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                maxLength={9}
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="next"
              />
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Parol (keyin kirish uchun)</Text>
            <View style={styles.field}>
              <View style={styles.fieldIcon}>
                <Feather name="lock" size={16} color="#5C328E" />
              </View>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                placeholder="Kamida 6 belgi"
                placeholderTextColor="#A8B0C0"
                style={[styles.input, inputWebFix]}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
              />
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={10}>
                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {alreadyRegistered ? (
              <Pressable onPress={() => router.push('/login')} style={styles.btnLoginAlt}>
                <Text style={styles.btnLoginAltText}>Kirish sahifasiga o‘tish</Text>
                <Feather name="arrow-right" size={16} color="#5C328E" />
              </Pressable>
            ) : null}

            <Pressable
              disabled={loading}
              onPress={() => void submit()}
              style={[styles.btn, { opacity: loading ? 0.75 : 1 }]}
            >
              <LinearGradient colors={['#FFCC00', '#F0B800']} style={styles.btnGrad}>
                {loading ? (
                  <ActivityIndicator color="#120724" />
                ) : (
                  <>
                    <Text style={styles.btnText}>SMS kod olish</Text>
                    <Feather name="arrow-right" size={18} color="#120724" />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Allaqachon hisobingiz bormi?</Text>
            <Pressable onPress={() => router.push('/login')}>
              <Text style={styles.footerLink}> Kirish</Text>
            </Pressable>
          </View>

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
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: {
    width: 52,
    height: 52,
  },
  topSpacer: { width: 42 },
  brand: {
    color: '#FFCC00',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  hello: {
    marginTop: 6,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    lineHeight: 34,
  },
  lead: {
    marginTop: 6,
    marginBottom: 16,
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
  errorBox: {
    marginTop: 14,
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
  btn: { marginTop: 14, borderRadius: 16, overflow: 'hidden' },
  btnGrad: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#120724' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
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
