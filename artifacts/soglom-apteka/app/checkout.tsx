import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api, API_URL, newIdempotencyKey, type ApiError } from '@/lib/api';

/** Same key as cart.tsx — client price-change notice only, never financial SoT. */
const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';

export default function CheckoutScreen() {
  const colors = useColors();
  const { t, refresh, balance, user } = useApp();
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState('pay_at_branch');
  const [address, setAddress] = useState('');
  const [useCashback, setUseCashback] = useState(false);
  const [cart, setCart] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const idempotencyRef = useRef<string | null>(null);

  useEffect(() => {
    void loadCheckout();
  }, []);

  async function loadCheckout() {
    setLoadError(null);
    try {
      const [b, c, r] = await Promise.all([
        api.branches(),
        api.cart(),
        api.cashbackRules().catch(() => null),
      ]);
      setBranches(b.branches || []);
      setCart(c);
      setBranchId(c.branch?.id ?? null);
      setRules(r);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Yuklanmadi');
    }
  }

  const deliveryFeeKnown = fulfillment !== 'delivery' || (rules != null && typeof rules.deliveryFee === 'number');
  const deliveryFee = fulfillment === 'delivery' && deliveryFeeKnown ? Number(rules.deliveryFee) : 0;
  const goods = cart?.subtotal || 0;
  const maxSpendRatio =
    typeof rules?.maxSpendRatio === 'number'
      ? rules.maxSpendRatio
      : typeof rules?.maxSpendPercent === 'number'
        ? rules.maxSpendPercent / 100
        : null;
  const cashbackUsed =
    useCashback && maxSpendRatio != null
      ? Math.min(balance, Math.floor(goods * Math.max(0, Math.min(1, maxSpendRatio))))
      : 0;
  const tierRate = useMemo(() => {
    const tiers = Array.isArray(rules?.tiers) ? rules.tiers : [];
    const tier = String(user?.tier || '').toLowerCase();
    const match = tiers.find((t: any) => String(t.tier || '').toLowerCase().includes(tier.includes('plat') ? 'plat' : tier.includes('silver') ? 'silver' : 'gold'));
    if (match?.rate != null) {
      const raw = String(match.rate).replace('%', '');
      const n = Number(raw);
      if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
    }
    return null;
  }, [user?.tier, rules]);
  const earnPreview = tierRate != null ? Math.floor(Math.max(0, goods - cashbackUsed) * tierRate) : null;
  const total = Math.max(0, goods + deliveryFee - cashbackUsed);

  const earnHint =
    fulfillment === 'delivery'
      ? 'Cashback yetkazib berilgandan keyin balansga tushadi'
      : paymentMethod === 'pay_at_branch' || paymentMethod === 'cod'
        ? 'Cashback filial kassasida (FOM) to‘lov/berishdan keyin tushadi'
        : 'Onlayn to‘lovdan keyin bron saqlanadi; cashback filialda berilganda tushadi';

  const paymentOptions: Array<{ value: string; label: string; enabled: boolean }> = [
    { value: 'pay_at_branch', label: 'Filialda (FOM: Click / Payme / naqd)', enabled: true },
    { value: 'cod', label: t('payCod'), enabled: fulfillment === 'delivery' },
    {
      value: 'payme',
      label: 'Payme (onlayn — production PSP o‘chirilgan)',
      enabled: false,
    },
    {
      value: 'click',
      label: 'Click (onlayn — production PSP o‘chirilgan)',
      enabled: false,
    },
  ];

  const submit = async () => {
    if (submitting) return;
    if (!cart?.items?.length) {
      Alert.alert('Savat', 'Savat bo‘sh');
      return;
    }
    if (!branchId) {
      Alert.alert('Filial', 'Buyurtma uchun filialni tanlang');
      return;
    }
    if (fulfillment === 'delivery' && !deliveryFeeKnown) {
      Alert.alert('Yetkazish', 'Yetkazish narxi serverdan yuklanmadi. Qayta urinib ko‘ring.');
      return;
    }
    if (fulfillment === 'delivery' && address.trim().length < 8) {
      Alert.alert('Manzil', 'Yetkazib berish manzilini kiriting');
      return;
    }
    if (!idempotencyRef.current) {
      idempotencyRef.current = newIdempotencyKey('checkout');
    }
    setSubmitting(true);
    try {
      await api.setCartBranch(branchId);
      const result = await api.checkout(
        { branchId, fulfillment, paymentMethod, address, useCashback },
        { idempotencyKey: idempotencyRef.current },
      );
      const orderId = result?.order?.id;
      if (orderId == null) {
        throw Object.assign(new Error('Buyurtma ID serverdan kelmadi'), { code: 'ORDER_ID_MISSING' });
      }
      // Cart cleared server-side on success; drop local price snap so it is never reused as truth.
      try {
        await AsyncStorage.removeItem(PRICE_SNAP_KEY);
      } catch {
        // ignore
      }
      await refresh();
      idempotencyRef.current = null;
      const checkoutUrl = result.payment?.checkoutUrl;
      if (checkoutUrl && (paymentMethod === 'payme' || paymentMethod === 'click')) {
        await Linking.openURL(`${API_URL}${checkoutUrl}`);
      }
      // Order detail loads authoritative totals from GET /api/orders/:id — not checkout preview.
      router.replace(`/order/${orderId}`);
    } catch (error) {
      const err = error as ApiError;
      const code = err.code || '';
      let title = 'Xatolik';
      let message = err.message || 'Buyurtma yuborilmadi';
      if (code === 'STOCK_UNAVAILABLE') {
        title = 'Qoldiq o‘zgardi';
        message = 'Mahsulot qoldig‘i yetarli emas. Savatni yangilab qayta urinib ko‘ring.';
      } else if (code === 'BRANCH_REQUIRED' || code === 'BRANCH_NOT_FOUND' || code === 'BRANCH_CLOSED') {
        title = 'Filial';
      } else if (code === 'INSUFFICIENT_CASHBACK' || code === 'SPEND_CAP_ZERO') {
        title = 'Cashback';
      } else if (code === 'CART_EMPTY') {
        title = 'Savat';
      }
      Alert.alert(title, message);
      // Keep same idempotency key on retry for safe double-tap recovery.
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{loadError}</Text>
        <Pressable
          onPress={() => void loadCheckout()}
          style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: colors.primary }}
        >
          <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>Qayta urinish</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!cart) {
    return (
      <Screen>
        <Text style={{ color: colors.mutedForeground }}>Yuklanmoqda...</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('checkout')}</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Dorixona FOMda skan/to‘lov qiladi. Ilova — bron, yetkazish va cashback. Summalar taxminiy — yakuniy hisob serverda.
      </Text>

      {!cart.items?.length ? (
        <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>Savat bo‘sh</Text>
      ) : null}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Filial</Text>
      {!branchId ? (
        <Text style={{ color: '#B45309', fontFamily: 'Inter_600SemiBold', marginBottom: 8, fontSize: 12 }}>
          Filial tanlanmagan — qoldiq va bron uchun filial majburiy
        </Text>
      ) : null}
      {branches.map((branch) => (
        <Pressable
          key={branch.id}
          onPress={() => setBranchId(branch.id)}
          style={[styles.option, { borderColor: branchId === branch.id ? colors.primary : colors.border }]}
        >
          <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{branch.name}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {branch.address}
            {branch.distanceKm != null ? ` · ${branch.distanceKm} km` : ''}
          </Text>
        </Pressable>
      ))}

      <View style={styles.row}>
        <Pressable onPress={() => setFulfillment('pickup')} style={[styles.pill, { backgroundColor: fulfillment === 'pickup' ? colors.primary : colors.card }]}>
          <Text style={{ color: fulfillment === 'pickup' ? '#fff' : colors.foreground }}>{t('pickup')}</Text>
        </Pressable>
        <Pressable onPress={() => setFulfillment('delivery')} style={[styles.pill, { backgroundColor: fulfillment === 'delivery' ? colors.primary : colors.card }]}>
          <Text style={{ color: fulfillment === 'delivery' ? '#fff' : colors.foreground }}>{t('delivery')}</Text>
        </Pressable>
      </View>
      {fulfillment === 'delivery' ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
          Ichki yetkazib berish. Tashqi kuryer shartnomasi hali yo‘q — ETA/narx inventar qilinmaydi.
        </Text>
      ) : null}

      {fulfillment === 'delivery' ? (
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Manzil: tuman, ko‘cha, uy"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        />
      ) : null}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>To‘lov</Text>
      {paymentOptions.map((opt) => (
        <Pressable
          key={opt.value}
          disabled={!opt.enabled}
          onPress={() => {
            if (!opt.enabled) return;
            setPaymentMethod(opt.value);
          }}
          style={[
            styles.option,
            {
              borderColor: paymentMethod === opt.value ? colors.primary : colors.border,
              opacity: opt.enabled ? 1 : 0.45,
            },
          ]}
        >
          <Text style={{
            fontFamily: 'Inter_600SemiBold',
            color: opt.enabled ? colors.foreground : colors.mutedForeground,
          }}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => setUseCashback(!useCashback)}
        style={[styles.option, { borderColor: useCashback ? colors.primary : colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
          Cashback ishlatish {useCashback ? '· yoqilgan' : ''}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
          Mavjud: {formatUzs(balance)} · taxminiy: {formatUzs(cashbackUsed)}
          {maxSpendRatio != null ? ` (max ${Math.round(maxSpendRatio * 100)}%)` : ' · limit serverdan'}
        </Text>
      </Pressable>

      <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Row label="Tovarlar (taxminiy)" value={formatUzs(goods)} />
        {fulfillment === 'delivery' ? (
          deliveryFeeKnown
            ? <Row label="Yetkazish (server)" value={formatUzs(deliveryFee)} />
            : <Row label="Yetkazish" value="Noma’lum — qayta yuklang" accent="#B45309" />
        ) : null}
        {cashbackUsed > 0 ? <Row label="Cashback −" value={`−${formatUzs(cashbackUsed)}`} accent="#B45309" /> : null}
        <Row label="Jami (taxminiy)" value={formatUzs(total)} bold />
        {earnPreview != null && tierRate != null ? (
          <Row label={`Kutilayotgan cashback (~${Math.round(tierRate * 100)}%)`} value={`+${formatUzs(earnPreview)}`} accent="#0D9488" />
        ) : (
          <Row label="Kutilayotgan cashback" value="Server qoidalaridan" accent="#64748B" />
        )}
        <Text style={[styles.earnHint, { color: colors.mutedForeground }]}>{earnHint}</Text>
        <Text style={[styles.earnHint, { color: colors.mutedForeground }]}>
          Buyurtma yaratilishi ≠ to‘lov. To‘lov holati alohida.
        </Text>
      </View>

      <Pressable
        disabled={submitting || !branchId || !cart.items?.length || (fulfillment === 'delivery' && !deliveryFeeKnown)}
        onPress={submit}
        style={[
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: submitting || !branchId || !cart.items?.length || (fulfillment === 'delivery' && !deliveryFeeKnown) ? 0.5 : 1,
          },
        ]}
      >
        <Text style={styles.buttonText}>{submitting ? 'Yuborilmoqda...' : 'Buyurtmani tasdiqlash'}</Text>
      </Pressable>
    </Screen>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ fontFamily: bold ? 'Inter_700Bold' : 'Inter_400Regular', color: '#64748B', fontSize: 13 }}>{label}</Text>
      <Text style={{ fontFamily: bold ? 'Inter_700Bold' : 'Inter_600SemiBold', color: accent || '#2A104E', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, marginBottom: 6 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  label: { fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 8 },
  option: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pill: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 48, paddingHorizontal: 12, marginTop: 8 },
  summary: { marginTop: 16, borderWidth: 1, borderRadius: 16, padding: 14 },
  earnHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 6 },
  button: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 24 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold' },
});
