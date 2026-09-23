import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen } from '@/components/AppUI';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const GOLD = '#e7ad17';
const DANGER = '#DC2626';

const TAGS = ['Tez xizmat', 'Professional', 'Toza filial', 'Yaxshi muloqot', 'Tavsiya qilaman'];

type RateableOrder = {
  id: number;
  code: string;
  branchName: string;
  canRate: boolean;
  alreadyRated: boolean;
};

function mapOrder(o: any): RateableOrder {
  return {
    id: Number(o.id),
    code: String(o.code || ''),
    branchName: String(o.branch?.name || `Filial #${o.branchId || '—'}`),
    canRate: Boolean(o.canRate),
    alreadyRated: Boolean(o.alreadyRated),
  };
}

export default function RatingScreen() {
  const { t } = useApp();
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
          setLoadError('Baholash uchun mos buyurtma topilmadi.');
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
      if (err?.status === 401 || err?.status === 403) {
        setLoadError('Sessiya tugagan. Qayta kiring.');
      } else {
        setLoadError(err?.message || 'Buyurtmalarni yuklab bo‘lmadi');
      }
    } finally {
      setLoading(false);
    }
  }, [paramOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const onSubmit = async () => {
    if (savingLock.current || saving || success || alreadyRated) return;
    setSaveError(null);
    if (!selected) {
      setSaveError('Baholash uchun buyurtma tanlang');
      return;
    }
    if (rating < 1 || rating > 5) {
      setSaveError('1 dan 5 gacha baho tanlang');
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
      }, 600);
    } catch (err: any) {
      if (err?.status === 409) {
        setAlreadyRated(true);
        setSaveError('Bu buyurtma allaqachon baholangan');
      } else if (err?.status === 401 || err?.status === 403) {
        setSaveError('Sessiya tugagan. Qayta kiring.');
      } else {
        setSaveError(err?.message || 'Saqlashda xatolik yuz berdi');
      }
    } finally {
      setSaving(false);
      savingLock.current = false;
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={PURPLE} size="large" />
          <Text style={styles.stateText}>Yuklanmoqda...</Text>
        </View>
      </Screen>
    );
  }

  if (loadError && !selected) {
    return (
      <Screen>
        <View style={styles.state}>
          <MaterialCommunityIcons name="clipboard-text-off-outline" size={44} color={MUTED} />
          <Text style={styles.stateTitle}>{loadError}</Text>
          <Text style={styles.stateText}>
            Xodim (employee) identifikatori tizimda yo‘q — faqat yakunlangan buyurtma filialini
            baholash mumkin.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => void load()}>
            <Text style={styles.primaryBtnText}>Qayta urinish</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push('/(tabs)/purchases')}>
            <Text style={styles.secondaryBtnText}>Buyurtmalarga o‘tish</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!selected && eligible.length === 0) {
    return (
      <Screen>
        <View style={styles.state}>
          <MaterialCommunityIcons name="star-off-outline" size={44} color={MUTED} />
          <Text style={styles.stateTitle}>Baholash uchun mos buyurtma topilmadi.</Text>
          <Text style={styles.stateText}>
            Faqat yakunlangan va hali baholanmagan buyurtmalar uchun filial xizmatini baholash mumkin.
            Alohida xodim baholash hozircha mavjud emas.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/purchases')}>
            <Text style={styles.primaryBtnText}>Buyurtmalarga o‘tish</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          Filial xizmatini baholang. Xodim tanlash mavjud emas — tizimda buyurtmaga bog‘langan
          xodim yo‘q.
        </Text>

        {eligible.length > 1 && !alreadyRated ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Buyurtmani tanlang</Text>
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
                    <Text style={styles.orderBranch}>{o.branchName}</Text>
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
              <MaterialCommunityIcons name="storefront-outline" size={36} color={PURPLE} />
            </View>
            <Text style={styles.targetTitle}>Filial xizmati</Text>
            <Text style={styles.targetMeta}>{selected.branchName}</Text>
            <Text style={styles.targetCode}>Buyurtma: {selected.code}</Text>
          </View>
        ) : null}

        {alreadyRated ? (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={16} color="#15803D" />
            <Text style={styles.successText}>Bu buyurtma allaqachon baholangan</Text>
          </View>
        ) : (
          <>
            <Text style={styles.question}>{t('selectRating')}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((item) => (
                <Pressable key={item} onPress={() => setRating(item)} hitSlop={6}>
                  <Feather
                    name="star"
                    size={34}
                    color={item <= rating ? GOLD : BORDER}
                    fill={item <= rating ? GOLD : 'transparent'}
                  />
                </Pressable>
              ))}
            </View>

            <View style={styles.tags}>
              {TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[styles.tag, active && styles.tagActive]}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Izoh qoldirish (ixtiyoriy)"
              placeholderTextColor={MUTED}
              multiline
              numberOfLines={5}
              style={styles.input}
              editable={!saving}
              maxLength={2000}
            />

            {saveError ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={DANGER} />
                <Text style={styles.errorText}>{saveError}</Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={16} color="#15803D" />
                <Text style={styles.successText}>{t('thankYou')}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void onSubmit()}
              disabled={saving || !selected || rating < 1}
              style={[styles.submit, (saving || rating < 1) && { opacity: 0.55 }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitText}>{t('send')}</Text>
                  <Feather name="arrow-right" size={17} color="#fff" />
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, gap: 12 },
  lead: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
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
  orderRowActive: { borderColor: PURPLE, backgroundColor: '#F3E8FF' },
  orderCode: { fontFamily: 'Inter_700Bold', fontSize: 14, color: PURPLE_DEEP },
  orderBranch: { fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED, marginTop: 2 },
  targetCard: {
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  targetTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: PURPLE_DEEP },
  targetMeta: { fontFamily: 'Inter_500Medium', fontSize: 13, color: MUTED, marginTop: 6, textAlign: 'center' },
  targetCode: { fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED, marginTop: 4 },
  question: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    textAlign: 'center',
    color: PURPLE_DEEP,
    marginTop: 8,
  },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  tag: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: CARD,
  },
  tagActive: { backgroundColor: '#F3E8FF', borderColor: PURPLE },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: MUTED },
  tagTextActive: { color: PURPLE },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
    textAlignVertical: 'top',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    borderColor: BORDER,
    backgroundColor: CARD,
    color: PURPLE_DEEP,
  },
  submit: {
    minHeight: 49,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
    backgroundColor: PURPLE,
  },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
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
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: PURPLE, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
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
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, color: DANGER, lineHeight: 18 },
  successBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#15803D' },
});
