import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import type { TranslationKey } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const GOLD = '#F59E0B';
const DANGER = '#DC2626';

/** `value` is sent to the API as-is (existing backend data uses these Uzbek strings); only `labelKey` is displayed. */
const TAGS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'Tez xizmat', labelKey: 'orders.ratingTagFast' }, // i18n-ignore: stable API tag value
  { value: 'Professional', labelKey: 'orders.ratingTagProfessional' }, // i18n-ignore: stable API tag value
  { value: 'Toza filial', labelKey: 'orders.ratingTagClean' }, // i18n-ignore: stable API tag value
  { value: 'Yaxshi muloqot', labelKey: 'orders.ratingTagCommunication' }, // i18n-ignore: stable API tag value
  { value: 'Tavsiya qilaman', labelKey: 'orders.ratingTagRecommend' }, // i18n-ignore: stable API tag value
];

type RateableOrder = {
  id: number;
  code: string;
  branchName: string;
  branchId: string;
  canRate: boolean;
  alreadyRated: boolean;
};

function mapOrder(o: any): RateableOrder {
  return {
    id: Number(o.id),
    code: String(o.code || ''),
    branchName: String(o.branch?.name || ''),
    branchId: String(o.branchId || '—'),
    canRate: Boolean(o.canRate),
    alreadyRated: Boolean(o.alreadyRated),
  };
}

export default function RatingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const branchTitle = (o: RateableOrder) =>
    o.branchName || t('orders.ratingBranchFallback', { id: o.branchId });
  const params = useLocalSearchParams<{ orderId?: string }>();
  const paramOrderId = params.orderId ? Number(params.orderId) : NaN;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<RateableOrder[]>([]);
  const [selected, setSelected] = useState<RateableOrder | null>(null);
  const [alreadyRated, setAlreadyRated] = useState(false);

  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSuccess(false);
    try {
      if (Number.isInteger(paramOrderId) && paramOrderId > 0) {
        const data = await api.order(paramOrderId);
        const order = mapOrder(data.order);
        if (order.alreadyRated) {
          setSelected(order);
          setAlreadyRated(true);
          setEligible([]);
        } else if (order.canRate) {
          setSelected(order);
          setAlreadyRated(false);
          setEligible([order]);
        } else {
          setSelected(null);
          setAlreadyRated(false);
          setEligible([]);
          setLoadError(t('orders.ratingNoEligible'));
        }
      } else {
        const data = await api.orders();
        const list = (data.orders || []).map(mapOrder);
        const rateable = list.filter((o) => o.canRate);
        setEligible(rateable);
        setAlreadyRated(false);
        if (rateable.length === 1) setSelected(rateable[0]);
        else setSelected(null);
        if (rateable.length === 0) {
          setLoadError(null);
        }
      }
    } catch (err: any) {
      setEligible([]);
      setSelected(null);
      setLoadError(
        localizeError(err, t, {
          byStatus: { 401: 'common.errorSessionExpired', 403: 'common.errorSessionExpired' },
          fallback: 'orders.listLoadFailed',
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [paramOrderId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((v) => v !== tag) : [...prev, tag]));
  };

  const onSubmit = async () => {
    if (savingLock.current || saving || success || alreadyRated) return;
    setSaveError(null);
    if (!selected) {
      setSaveError(t('orders.ratingSelectOrderError'));
      return;
    }
    if (rating < 1 || rating > 5) {
      setSaveError(t('orders.ratingSelectStarsError'));
      return;
    }

    savingLock.current = true;
    setSaving(true);
    try {
      await api.rateStaff({
        orderId: selected.id,
        rating,
        tags,
        comment: comment.trim(),
      });
      setSuccess(true);
      setAlreadyRated(true);
      setTimeout(() => {
        // Prefer prior context (Profile or Order). Purchases only as cold-open fallback.
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/purchases');
      }, 700);
    } catch (err: any) {
      if (err?.status === 409) {
        setAlreadyRated(true);
        setSaveError(t('orders.ratingAlreadyRated'));
      } else {
        setSaveError(
          localizeError(err, t, {
            byStatus: { 401: 'common.errorSessionExpired', 403: 'common.errorSessionExpired' },
            fallback: 'orders.ratingSaveFailed',
          }),
        );
      }
    } finally {
      setSaving(false);
      savingLock.current = false;
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/purchases');
  };

  return (
    <View style={styles.pageRoot}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header Bar */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable
          onPress={handleBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('orders.backToOrdersA11y')}
        >
          <Feather name="arrow-left" size={20} color={PURPLE_DEEP} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{t('orders.ratingTitle')}</Text>
          <Text style={styles.headerSubtitle}>{t('orders.ratingSubtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={PURPLE} size="large" />
          <Text style={styles.stateText}>{t('common.loading')}</Text>
        </View>
      ) : loadError && !selected ? (
        <View style={styles.state}>
          <MaterialCommunityIcons name="clipboard-text-off-outline" size={44} color={MUTED} />
          <Text style={styles.stateTitle}>{loadError}</Text>
          <Text style={styles.stateText}>{t('orders.ratingLoadFailedHint')}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void load()}>
            <Text style={styles.primaryBtnText}>{t('common.retry')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push('/(tabs)/purchases')}>
            <Text style={styles.secondaryBtnText}>{t('orders.goToOrders')}</Text>
          </Pressable>
        </View>
      ) : !selected && eligible.length === 0 ? (
        <View style={styles.state}>
          <MaterialCommunityIcons name="star-off-outline" size={44} color={MUTED} />
          <Text style={styles.stateTitle}>{t('orders.ratingNoEligible')}</Text>
          <Text style={styles.stateText}>{t('orders.ratingNoEligibleText')}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/purchases')}>
            <Text style={styles.primaryBtnText}>{t('orders.goToOrders')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>{t('orders.ratingLead')}</Text>

          {eligible.length > 1 && !alreadyRated ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t('orders.ratingChooseOrder')}</Text>
              {eligible.map((o) => {
                const active = selected?.id === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setSelected(o)}
                    style={[styles.orderRow, active && styles.orderRowActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderCode}>{o.code}</Text>
                      <Text style={styles.orderBranch}>{branchTitle(o)}</Text>
                    </View>
                    {active ? <Feather name="check-circle" size={18} color={PURPLE} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {selected ? (
            <View style={styles.targetCard}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="storefront-outline" size={32} color={PURPLE} />
              </View>
              <Text style={styles.targetTitle}>{t('orders.ratingTargetTitle')}</Text>
              <Text style={styles.targetMeta}>{branchTitle(selected)}</Text>
              <Text style={styles.targetCode}>{t('orders.ratingOrderCode', { code: selected.code })}</Text>
            </View>
          ) : null}

          {alreadyRated ? (
            <View style={styles.successBox}>
              <Feather name="check-circle" size={18} color="#15803D" />
              <Text style={styles.successText}>{t('orders.ratingAlreadyRated')}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.question}>{t('orders.ratingQuestion')}</Text>

              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setRating(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item <= rating }}
                    accessibilityLabel={t('orders.ratingStarA11y', { value: item })}
                    style={({ pressed }) => [styles.starBtn, pressed && { transform: [{ scale: 1.15 }] }]}
                  >
                    <MaterialCommunityIcons
                      name={item <= rating ? 'star' : 'star-outline'}
                      size={36}
                      color={item <= rating ? GOLD : '#CBD5E1'}
                    />
                  </Pressable>
                ))}
              </View>

              {rating > 0 ? (
                <View style={styles.ratingScoreBadge}>
                  <Text style={styles.ratingScoreText}>
                    {t(`orders.ratingScore${rating}` as TranslationKey)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.tags}>
                {TAGS.map((tag) => {
                  const active = tags.includes(tag.value);
                  return (
                    <Pressable
                      key={tag.value}
                      onPress={() => toggleTag(tag.value)}
                      style={[styles.tag, active && styles.tagActive]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                    >
                      {active ? (
                        <Feather name="check" size={13} color={PURPLE} style={{ marginRight: 4 }} />
                      ) : null}
                      <Text style={[styles.tagText, active && styles.tagTextActive]}>{t(tag.labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder={t('orders.ratingCommentPlaceholder')}
                  placeholderTextColor={MUTED}
                  multiline
                  numberOfLines={4}
                  style={styles.input}
                  editable={!saving}
                  maxLength={2000}
                />
                <Text style={styles.charCounter}>{comment.length} / 2000</Text>
              </View>

              {saveError ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color={DANGER} />
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              ) : null}

              {success ? (
                <View style={styles.successBox}>
                  <Feather name="check-circle" size={18} color="#15803D" />
                  <Text style={styles.successText}>{t('orders.ratingThankYou')}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => void onSubmit()}
                disabled={saving || !selected || rating < 1}
                style={[styles.submit, (saving || rating < 1) && { opacity: 0.55 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || !selected || rating < 1 }}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.submitText}>{t('common.send')}</Text>
                    <Feather name="arrow-right" size={17} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: BG,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  lead: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    padding: 14,
    gap: 8,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
    marginBottom: 4,
  },
  orderRow: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BG,
  },
  orderRowActive: {
    borderColor: PURPLE,
    backgroundColor: '#F3E8FF',
  },
  orderCode: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  orderBranch: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  targetCard: {
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  targetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: PURPLE_DEEP,
  },
  targetMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
    marginTop: 4,
    textAlign: 'center',
  },
  targetCode: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
  },
  question: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    textAlign: 'center',
    color: PURPLE_DEEP,
    marginTop: 6,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  starBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingScoreBadge: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    marginTop: 4,
  },
  ratingScoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#92400E',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  tag: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CARD,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagActive: {
    backgroundColor: '#F3E8FF',
    borderColor: PURPLE,
  },
  tagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
  },
  tagTextActive: {
    color: PURPLE,
    fontFamily: 'Inter_600SemiBold',
  },
  inputContainer: {
    marginTop: 8,
    position: 'relative',
  },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    paddingBottom: 28,
    textAlignVertical: 'top',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    borderColor: '#ECE7F6',
    backgroundColor: CARD,
    color: PURPLE_DEEP,
  },
  charCounter: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: MUTED,
  },
  submit: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    backgroundColor: PURPLE,
  },
  submitText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
    paddingVertical: 40,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: PURPLE,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  errorBox: {
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
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    justifyContent: 'center',
  },
  successText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#15803D',
  },
});
