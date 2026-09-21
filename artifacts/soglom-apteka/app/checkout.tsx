import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api, API_URL } from '@/lib/api';

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

  useEffect(() => {
    void Promise.all([
      api.branches(41.3111, 69.2797),
      api.cart(),
      api.cashbackRules().catch(() => null),
    ]).then(([b, c, r]) => {
      setBranches(b.branches.slice(0, 12));
      setCart(c);
      setBranchId(c.branch?.id || b.branches[0]?.id || null);
      setRules(r);
    });
  }, []);

  const deliveryFee = fulfillment === 'delivery' ? (rules?.deliveryFee ?? 15000) : 0;
  const goods = cart?.subtotal || 0;
  const cashbackUsed = useCashback ? Math.min(balance, goods) : 0;
  const tierRate = useMemo(() => {
    const tier = String(user?.tier || 'Gold').toLowerCase();
    if (tier.includes('platinum')) return 0.07;
    if (tier.includes('silver')) return 0.03;
    return 0.05;
  }, [user?.tier]);
  const earnPreview = Math.floor(Math.max(0, goods - cashbackUsed) * tierRate);
  const total = Math.max(0, goods + deliveryFee - cashbackUsed);

  const earnHint =
    fulfillment === 'delivery'
      ? 'Cashback yetkazib berilgandan keyin balansga tushadi'
      : paymentMethod === 'pay_at_branch' || paymentMethod === 'cod'
        ? 'Cashback filial kassasida (FOM) to‘lov/berishdan keyin tushadi'
        : 'Onlayn to‘lovdan keyin bron saqlanadi; cashback filialda berilganda tushadi';

  const submit = async () => {
    try {
      if (branchId) await api.setCartBranch(branchId);
      const result = await api.checkout({ branchId, fulfillment, paymentMethod, address, useCashback });
      await refresh();
      const checkoutUrl = result.payment?.checkoutUrl;
      if (checkoutUrl) {
        await Linking.openURL(`${API_URL}${checkoutUrl}`);
      }
      router.replace(`/order/${result.order.id}`);
    } catch (error) {
      Alert.alert('Xatolik', error instanceof Error ? error.message : 'Buyurtma yuborilmadi');
    }
  };

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('checkout')}</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Dorixona FOMda skan/to‘lov qiladi. Ilova — bron, yetkazish va cashback.
      </Text>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>Filial</Text>
      {branches.map((branch) => (
        <Pressable key={branch.id} onPress={() => setBranchId(branch.id)} style={[styles.option, { borderColor: branchId === branch.id ? colors.primary : colors.border }]}>
          <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{branch.name}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{branch.address} · {branch.distanceKm ?? '—'} km</Text>
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
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Manzil: tuman, ko‘cha, uy"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        />
      ) : null}

      <Text style={[styles.label, { color: colors.mutedForeground }]}>To‘lov</Text>
      {[
        ['pay_at_branch', 'Filialda (FOM: Click / Payme / naqd)'],
        ['cod', t('payCod')],
        ['payme', 'Payme (onlayn)'],
        ['click', 'Click (onlayn)'],
      ].map(([value, label]) => (
        <Pressable key={value} onPress={() => setPaymentMethod(value)} style={[styles.option, { borderColor: paymentMethod === value ? colors.primary : colors.border }]}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{label}</Text>
        </Pressable>
      ))}

      <Pressable onPress={() => setUseCashback(!useCashback)} style={[styles.option, { borderColor: useCashback ? colors.primary : colors.border }]}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
          Cashback ishlatish {useCashback ? '· yoqilgan' : ''}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
          Mavjud: {formatUzs(balance)} · ishlatiladi: {formatUzs(cashbackUsed)}
        </Text>
      </Pressable>

      <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Row label="Tovarlar" value={formatUzs(goods)} />
        {deliveryFee > 0 ? <Row label="Yetkazish" value={formatUzs(deliveryFee)} /> : null}
        {cashbackUsed > 0 ? <Row label="Cashback −" value={`−${formatUzs(cashbackUsed)}`} accent="#B45309" /> : null}
        <Row label="Jami to‘lov" value={formatUzs(total)} bold />
        <Row label={`Kutilayotgan cashback (${Math.round(tierRate * 100)}%)`} value={`+${formatUzs(earnPreview)}`} accent="#0D9488" />
        <Text style={[styles.earnHint, { color: colors.mutedForeground }]}>{earnHint}</Text>
      </View>

      <Pressable onPress={submit} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={styles.buttonText}>Buyurtmani tasdiqlash</Text>
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
