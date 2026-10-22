import { Feather } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
const PURPLE_LIGHT = '#F3E8FF';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const DANGER = '#DC2626';
const SUCCESS = '#15803D';
const SUCCESS_BG = '#F0FDF4';
const SUCCESS_BORDER = '#BBF7D0';

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

  // Basic profile state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [initialFirst, setInitialFirst] = useState('');
  const [initialLast, setInitialLast] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Forgot Password / OTP Reset state
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNewPassword, setOtpNewPassword] = useState('');
  const [otpConfirmPassword, setOtpConfirmPassword] = useState('');
  const [showOtpNewPass, setShowOtpNewPass] = useState(false);
  const [showOtpConfirmPass, setShowOtpConfirmPass] = useState(false);
  const [otpResetting, setOtpResetting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

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

  const onSavePassword = async () => {
    if (passwordSaving) return;
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.trim().length < 6) {
      setPasswordError(t('profile.editPasswordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.editPasswordMismatch'));
      return;
    }

    setPasswordSaving(true);
    try {
      await api.changePassword({
        currentPassword: currentPassword.trim() || undefined,
        newPassword: newPassword.trim(),
      });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      if (err?.message) {
        setPasswordError(err.message);
      } else if (err?.status === 401 || err?.status === 403) {
        setPasswordError(t('common.errorSessionExpired'));
      } else {
        setPasswordError(t('profile.editSaveFailed'));
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const onSendOtp = async () => {
    if (otpSending || !phone) return;
    setOtpError(null);
    setOtpSending(true);
    try {
      await api.requestOtp(phone, 'login');
      setOtpSent(true);
    } catch (err: any) {
      setOtpError(err?.message || t('profile.editSaveFailed'));
    } finally {
      setOtpSending(false);
    }
  };

  const onResetWithOtp = async () => {
    if (otpResetting) return;
    setOtpError(null);

    const safeCode = otpCode.replace(/\D/g, '');
    if (safeCode.length !== 6) {
      setOtpError(t('profile.editOtpRequired'));
      return;
    }
    if (otpNewPassword.trim().length < 6) {
      setOtpError(t('profile.editPasswordTooShort'));
      return;
    }
    if (otpNewPassword !== otpConfirmPassword) {
      setOtpError(t('profile.editPasswordMismatch'));
      return;
    }

    setOtpResetting(true);
    try {
      await api.resetPasswordWithOtp({
        code: safeCode,
        newPassword: otpNewPassword.trim(),
      });
      setShowOtpModal(false);
      setOtpCode('');
      setOtpNewPassword('');
      setOtpConfirmPassword('');
      setOtpSent(false);
      setPasswordSuccess(true);
    } catch (err: any) {
      setOtpError(err?.message || t('profile.editSaveFailed'));
    } finally {
      setOtpResetting(false);
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
          {/* Section 1: Basic Info */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Feather name="user" size={16} color={PURPLE} />
              </View>
              <Text style={styles.cardTitle}>{t('profile.editSectionBasic')}</Text>
            </View>

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

            {saveError ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={DANGER} />
                <Text style={styles.errorText}>{saveError}</Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={16} color={SUCCESS} />
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
          </View>

          {/* Section 2: Security & Password */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Feather name="lock" size={16} color={PURPLE} />
              </View>
              <View style={styles.cardHeaderTextWrap}>
                <Text style={styles.cardTitle}>{t('profile.editSecurityTitle')}</Text>
                <Text style={styles.cardSubtitle}>{t('profile.editSecuritySubtitle')}</Text>
              </View>
            </View>

            <Text style={styles.label}>{t('profile.editCurrentPassword')}</Text>
            <View style={styles.inputWithIcon}>
              <TextInput
                value={currentPassword}
                onChangeText={(v) => {
                  setCurrentPassword(v);
                  setPasswordError(null);
                  setPasswordSuccess(false);
                }}
                placeholder={t('profile.editCurrentPasswordPlaceholder')}
                placeholderTextColor={MUTED}
                style={styles.inputInner}
                secureTextEntry={!showCurrentPass}
                editable={!passwordSaving}
                autoCapitalize="none"
              />
              <Pressable
                onPress={() => setShowCurrentPass(!showCurrentPass)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather name={showCurrentPass ? 'eye-off' : 'eye'} size={18} color={MUTED} />
              </Pressable>
            </View>

            {/* Forgot password link */}
            <Pressable
              onPress={() => {
                setShowOtpModal(true);
                setOtpError(null);
              }}
              style={styles.forgotPassBtn}
              hitSlop={6}
            >
              <Text style={styles.forgotPassText}>{t('profile.editForgotPassword')}</Text>
            </Pressable>

            <Text style={[styles.label, { marginTop: 14 }]}>{t('profile.editNewPassword')}</Text>
            <View style={styles.inputWithIcon}>
              <TextInput
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  setPasswordError(null);
                  setPasswordSuccess(false);
                }}
                placeholder={t('profile.editNewPasswordPlaceholder')}
                placeholderTextColor={MUTED}
                style={styles.inputInner}
                secureTextEntry={!showNewPass}
                editable={!passwordSaving}
                autoCapitalize="none"
              />
              <Pressable
                onPress={() => setShowNewPass(!showNewPass)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather name={showNewPass ? 'eye-off' : 'eye'} size={18} color={MUTED} />
              </Pressable>
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>{t('profile.editConfirmPassword')}</Text>
            <View style={styles.inputWithIcon}>
              <TextInput
                value={confirmPassword}
                onChangeText={(v) => {
                  setConfirmPassword(v);
                  setPasswordError(null);
                  setPasswordSuccess(false);
                }}
                placeholder={t('profile.editConfirmPasswordPlaceholder')}
                placeholderTextColor={MUTED}
                style={styles.inputInner}
                secureTextEntry={!showConfirmPass}
                editable={!passwordSaving}
                autoCapitalize="none"
              />
              <Pressable
                onPress={() => setShowConfirmPass(!showConfirmPass)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather name={showConfirmPass ? 'eye-off' : 'eye'} size={18} color={MUTED} />
              </Pressable>
            </View>

            {passwordError ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={DANGER} />
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            ) : null}

            {passwordSuccess ? (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={16} color={SUCCESS} />
                <Text style={styles.successText}>{t('profile.editPasswordSuccess')}</Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.secondaryActionBtn,
                (passwordSaving || !newPassword.trim()) && styles.primaryBtnDisabled,
              ]}
              onPress={() => void onSavePassword()}
              disabled={passwordSaving || !newPassword.trim()}
            >
              {passwordSaving ? (
                <ActivityIndicator color={PURPLE} />
              ) : (
                <>
                  <Feather name="shield" size={16} color={PURPLE} />
                  <Text style={styles.secondaryActionBtnText}>{t('profile.editChangePasswordBtn')}</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Section 3: Security Tips */}
          <View style={styles.tipCard}>
            <View style={styles.tipIconWrap}>
              <Feather name="shield" size={18} color="#059669" />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>{t('profile.editSecurityTipsTitle')}</Text>
              <Text style={styles.tipBody}>{t('profile.editSecurityTipsBody')}</Text>
            </View>
          </View>

          {/* Modal: SMS OTP Password Reset */}
          <Modal
            visible={showOtpModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowOtpModal(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconWrap}>
                    <Feather name="message-square" size={18} color={PURPLE} />
                  </View>
                  <View style={styles.modalHeaderInfo}>
                    <Text style={styles.modalTitle}>{t('profile.editOtpModalTitle')}</Text>
                    <Text style={styles.modalSubtitle}>{formatPhone(phone)}</Text>
                  </View>
                  <Pressable
                    onPress={() => setShowOtpModal(false)}
                    hitSlop={8}
                    style={styles.modalCloseBtn}
                  >
                    <Feather name="x" size={20} color={MUTED} />
                  </Pressable>
                </View>

                {!otpSent ? (
                  <View style={styles.modalBody}>
                    <Text style={styles.modalDesc}>{t('profile.editOtpModalSubtitle')}</Text>
                    <Pressable
                      style={[styles.primaryBtn, otpSending && styles.primaryBtnDisabled]}
                      onPress={() => void onSendOtp()}
                      disabled={otpSending}
                    >
                      {otpSending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>{t('profile.editSendOtpBtn')}</Text>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.modalBody}>
                    <Text style={styles.label}>{t('profile.editOtpCode')}</Text>
                    <TextInput
                      value={otpCode}
                      onChangeText={(v) => {
                        setOtpCode(v);
                        setOtpError(null);
                      }}
                      placeholder={t('profile.editOtpCodePlaceholder')}
                      placeholderTextColor={MUTED}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={6}
                    />

                    <Text style={[styles.label, { marginTop: 12 }]}>{t('profile.editNewPassword')}</Text>
                    <View style={styles.inputWithIcon}>
                      <TextInput
                        value={otpNewPassword}
                        onChangeText={(v) => {
                          setOtpNewPassword(v);
                          setOtpError(null);
                        }}
                        placeholder={t('profile.editNewPasswordPlaceholder')}
                        placeholderTextColor={MUTED}
                        style={styles.inputInner}
                        secureTextEntry={!showOtpNewPass}
                        autoCapitalize="none"
                      />
                      <Pressable
                        onPress={() => setShowOtpNewPass(!showOtpNewPass)}
                        style={styles.eyeBtn}
                        hitSlop={8}
                      >
                        <Feather name={showOtpNewPass ? 'eye-off' : 'eye'} size={18} color={MUTED} />
                      </Pressable>
                    </View>

                    <Text style={[styles.label, { marginTop: 12 }]}>{t('profile.editConfirmPassword')}</Text>
                    <View style={styles.inputWithIcon}>
                      <TextInput
                        value={otpConfirmPassword}
                        onChangeText={(v) => {
                          setOtpConfirmPassword(v);
                          setOtpError(null);
                        }}
                        placeholder={t('profile.editConfirmPasswordPlaceholder')}
                        placeholderTextColor={MUTED}
                        style={styles.inputInner}
                        secureTextEntry={!showOtpConfirmPass}
                        autoCapitalize="none"
                      />
                      <Pressable
                        onPress={() => setShowOtpConfirmPass(!showOtpConfirmPass)}
                        style={styles.eyeBtn}
                        hitSlop={8}
                      >
                        <Feather name={showOtpConfirmPass ? 'eye-off' : 'eye'} size={18} color={MUTED} />
                      </Pressable>
                    </View>

                    {otpError ? (
                      <View style={styles.errorBox}>
                        <Feather name="alert-circle" size={16} color={DANGER} />
                        <Text style={styles.errorText}>{otpError}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      style={[
                        styles.primaryBtn,
                        (otpResetting || otpCode.length < 6 || !otpNewPassword) && styles.primaryBtnDisabled,
                      ]}
                      onPress={() => void onResetWithOtp()}
                      disabled={otpResetting || otpCode.length < 6 || !otpNewPassword}
                    >
                      {otpResetting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>{t('profile.editResetPasswordBtn')}</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </Modal>
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
    paddingBottom: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    boxShadow: '0 2px 8px rgba(30,10,60,0.03)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1EFF6',
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: PURPLE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  cardSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
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
  inputWithIcon: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FAFBFE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  inputInner: {
    flex: 1,
    minHeight: 46,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 6,
  },
  forgotPassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 2,
  },
  forgotPassText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
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
    backgroundColor: SUCCESS_BG,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: SUCCESS_BORDER,
  },
  successText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: SUCCESS,
  },
  primaryBtn: {
    marginTop: 18,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  secondaryActionBtn: {
    marginTop: 18,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionBtnText: {
    color: PURPLE,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'flex-start',
  },
  tipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#065F46',
    marginBottom: 4,
  },
  tipBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#047857',
    lineHeight: 17,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,16,64,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 20,
    boxShadow: '0 12px 36px rgba(26,16,64,0.18)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PURPLE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderInfo: {
    flex: 1,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  modalSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    marginTop: 4,
  },
  modalDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
    marginBottom: 8,
  },
});
