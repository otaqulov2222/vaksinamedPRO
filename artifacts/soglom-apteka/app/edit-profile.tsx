import { Feather } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const DANGER = '#DC2626';

function formatPhone(phone: string) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) {
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  if (d.length === 9) {
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return phone || '—';
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { refresh, t } = useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [initialFirst, setInitialFirst] = useState('');
  const [initialLast, setInitialLast] = useState('');

  const dirty = firstName.trim() !== initialFirst || lastName.trim() !== initialLast;
  const allowLeaveRef = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(() => {
    const t = tRef.current;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSuccess(false);
    void api
      .profile()
      .then((data) => {
        const fn = String(data.firstName || '');
        const ln = String(data.lastName || '');
        setFirstName(fn);
        setLastName(ln);
        setInitialFirst(fn.trim());
        setInitialLast(ln.trim());
        setPhone(String(data.phone || ''));
      })
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401 || err.status === 403) {
          setLoadError(t('common.errorSessionExpired'));
        } else {
          setLoadError(localizeError(err, t, { fallback: 'profile.editLoadFailed' }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (allowLeaveRef.current || !dirty || saving) return;
      e.preventDefault();
      void (async () => {
        const ok = await confirmAction({
          title: t('common.unsavedTitle'),
          message: t('common.unsavedMessage'),
          confirmText: t('common.leave'),
          cancelText: t('common.stay'),
          destructive: true,
        });
        if (!ok) return;
        allowLeaveRef.current = true;
        navigation.dispatch(e.data.action as never);
      })();
    });
    return unsub;
  }, [navigation, dirty, saving, t]);

  const validate = (): string | null => {
    const fn = firstName.trim();
    if (fn.length < 2) return t('profile.editTooShortFirst');
    if (fn.length > 80) return t('profile.editTooLongFirst');
    if (lastName.trim().length > 80) return t('profile.editTooLongLast');
    return null;
  };

  const onSave = async () => {
    if (saving) return;
    setSaveError(null);
    setSuccess(false);
    const validation = validate();
    if (validation) {
      setSaveError(validation);
      return;
    }
    if (!dirty) {
      setSuccess(true);
      return;
    }

    setSaving(true);
    try {
      await api.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await refresh();
      setInitialFirst(firstName.trim());
      setInitialLast(lastName.trim());
      setSuccess(true);
      allowLeaveRef.current = true;
      setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/profile');
      }, 450);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        setSaveError(t('common.errorSessionExpired'));
      } else {
        setSaveError(localizeError(err, t, { fallback: 'profile.editSaveFailed' }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={PURPLE} size="large" />
          <Text style={styles.centerText}>{t('common.loading')}</Text>
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Feather name="cloud-off" size={40} color={MUTED} />
          <Text style={styles.centerTitle}>{t('profile.editLoadFailedTitle')}</Text>
          <Text style={styles.centerText}>{loadError}</Text>
          <Pressable style={styles.primaryBtn} onPress={load}>
            <Text style={styles.primaryBtnText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>{t('profile.editLead')}</Text>

          <View style={styles.card}>
            <Text style={styles.label}>{t('profile.editFirstName')}</Text>
            <TextInput
              value={firstName}
              onChangeText={(v) => {
                setFirstName(v);
                setSuccess(false);
                setSaveError(null);
              }}
              placeholder={t('profile.editFirstNamePlaceholder')}
              placeholderTextColor={MUTED}
              style={styles.input}
              autoCapitalize="words"
              editable={!saving}
              maxLength={80}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>{t('profile.editLastName')}</Text>
            <TextInput
              value={lastName}
              onChangeText={(v) => {
                setLastName(v);
                setSuccess(false);
                setSaveError(null);
              }}
              placeholder={t('profile.editLastNamePlaceholder')}
              placeholderTextColor={MUTED}
              style={styles.input}
              autoCapitalize="words"
              editable={!saving}
              maxLength={80}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>{t('profile.editPhone')}</Text>
            <View style={styles.readOnly}>
              <Text style={styles.readOnlyText}>{formatPhone(phone)}</Text>
              <Feather name="lock" size={16} color={MUTED} />
            </View>
            <Text style={styles.hint}>{t('profile.editPhoneHint')}</Text>
          </View>

          {saveError ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color={DANGER} />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <Feather name="check-circle" size={16} color="#15803D" />
              <Text style={styles.successText}>{t('profile.editSaved')}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryBtn, (saving || !dirty) && styles.primaryBtnDisabled]}
            onPress={() => void onSave()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{dirty ? t('common.save') : t('profile.editNoChanges')}</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  lead: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    marginBottom: 14,
    lineHeight: 18,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE_DEEP,
    marginBottom: 8,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FAFBFE',
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  readOnly: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F3F4F8',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readOnlyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: MUTED,
  },
  hint: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },
  errorBox: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: DANGER,
    lineHeight: 18,
  },
  successBox: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#15803D',
  },
  primaryBtn: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  centerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  centerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
});
