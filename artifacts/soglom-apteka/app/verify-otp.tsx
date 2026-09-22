import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useApp();
  const params = useLocalSearchParams<{ phone?: string; purpose?: string; firstName?: string; hint?: string }>();
  const phone = String(params.phone || '');
  const purpose = params.purpose === 'register' ? 'register' : 'login';
  const firstName = String(params.firstName || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [hint, setHint] = useState(__DEV__ ? String(params.hint || '') : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const showError = (msg: string) => {
    setError(msg);
    if (Platform.OS !== 'web') Alert.alert('Tasdiqlash', msg);
  };

  const verify = async () => {
    setError(null);
    if (code.length !== 6) {
      showError('6 xonali kodni kiriting');
      return;
    }
    setLoading(true);
    try {
      const { peekRegisterDraft, clearRegisterDraft } = await import('@/lib/registerDraft');
      const draft = purpose === 'register' ? peekRegisterDraft() : null;
      await api.verifyOtp({
        phone,
        code,
        purpose,
        firstName: purpose === 'register' ? (firstName || draft?.firstName) : undefined,
        password: purpose === 'register' ? draft?.password : undefined,
      });
      if (purpose === 'register') clearRegisterDraft();
      await refresh();
      router.replace('/(tabs)');
    } catch (err: any) {
      showError(err?.message || 'Kod noto‘g‘ri');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (seconds > 0) return;
    setError(null);
    setLoading(true);
    try {
      const data = await api.requestOtp(phone, purpose);
      if (__DEV__ && data.devCode) setHint(data.devCode);
      setSeconds(60);
      if (Platform.OS !== 'web') Alert.alert('SMS', 'Yangi kod yuborildi');
    } catch (err: any) {
      showError(err?.message || 'Xatolik');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2A104E', '#5C328E', '#F7F5F2']} style={styles.hero} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.body, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Feather name="chevron-left" size={20} color="#FFCC00" />
          </Pressable>

          <Text style={styles.title}>SMS kod</Text>
          <Text style={styles.sub}>
            +998 {phone} raqamiga yuborilgan 6 xonali kodni kiriting
          </Text>

          <View style={styles.card}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="• • • • • •"
              placeholderTextColor="#C4B5D6"
              style={styles.codeInput}
              maxLength={6}
              autoFocus
            />

            {__DEV__ && hint ? (
              <Text style={styles.devHint}>Dev kod: {hint}</Text>
            ) : null}

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <Pressable
              disabled={loading || code.length !== 6}
              onPress={() => void verify()}
              style={[styles.btn, { opacity: code.length === 6 && !loading ? 1 : 0.55 }]}
            >
              <LinearGradient colors={['#FFCC00', '#F0B800']} style={styles.btnGrad}>
                {loading ? <ActivityIndicator color="#120724" /> : <Text style={styles.btnText}>Tasdiqlash</Text>}
              </LinearGradient>
            </Pressable>

            <Pressable disabled={seconds > 0 || loading} onPress={() => void resend()} style={styles.resend}>
              <Text style={[styles.resendText, seconds > 0 && { color: '#94A3B8' }]}>
                {seconds > 0 ? `Qayta yuborish: ${seconds}s` : 'Kodni qayta yuborish'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F5F2' },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  body: { flex: 1, paddingHorizontal: 20 },
  back: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 28 },
  sub: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 8, marginBottom: 22, lineHeight: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 28, padding: 22,
    shadowColor: '#2A104E', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
  },
  codeInput: {
    fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: 10, textAlign: 'center',
    color: '#2A104E', backgroundColor: '#F8F5FC', borderRadius: 16, minHeight: 64,
    borderWidth: 1, borderColor: '#EDE4F7', outlineStyle: 'none' as any,
  },
  devHint: { textAlign: 'center', marginTop: 12, fontFamily: 'Inter_500Medium', fontSize: 12, color: '#0D9488' },
  errorText: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  btn: { marginTop: 18, borderRadius: 18, overflow: 'hidden' },
  btnGrad: { minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#120724' },
  resend: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  resendText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#5C328E' },
});
