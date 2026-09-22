import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api, type ApiError } from '@/lib/api';
import {
  formatCountdown,
  fulfillmentLabel,
  paymentLabel,
  reservationLabel,
} from '@/lib/orderLabels';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { refresh } = useApp();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api.order(Number(id));
      const o = data.order;
      setOrder(o);
      setError(null);
      if (o?.serverTime) {
        const serverMs = new Date(o.serverTime).getTime();
        if (Number.isFinite(serverMs)) skewRef.current = serverMs - Date.now();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Buyurtma yuklanmadi');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!order?.reservedUntil || !order.reservationActive) {
      setMsLeft(null);
      return;
    }
    const until = new Date(order.reservedUntil).getTime();
    if (!Number.isFinite(until)) {
      setMsLeft(null);
      return;
    }
    const tick = () => {
      const nowApprox = Date.now() + skewRef.current;
      const left = until - nowApprox;
      setMsLeft(left);
      if (left <= 0) void load();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [order?.reservedUntil, order?.reservationActive, order?.id, load]);

  const moneyRows = useMemo(() => {
    if (!order) return [] as Array<{ label: string; value: string; bold?: boolean }>;
    const rows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: 'Tovarlar', value: formatUzs(order.subtotal) },
    ];
    if (order.deliveryFee > 0) rows.push({ label: 'Yetkazish', value: formatUzs(order.deliveryFee) });
    if (order.cashbackUsed > 0) rows.push({ label: 'Cashback ishlatildi', value: `−${formatUzs(order.cashbackUsed)}` });
    rows.push({ label: 'Jami', value: formatUzs(order.total), bold: true });
    if (order.cashbackEarned > 0) {
      rows.push({ label: 'Buyurtma cashback (tarixiy)', value: `+${formatUzs(order.cashbackEarned)}` });
    }
    return rows;
  }, [order]);

  const onCancel = async () => {
    if (!order?.canCancel || cancelling) return;
    Alert.alert(
      'Bekor qilish',
      order.paymentStatus === 'PAID'
        ? 'Buyurtma bekor qilinadi. To‘lov avtomatik qaytarilmaydi (PSP refund alohida).'
        : 'Buyurtmani bekor qilishni tasdiqlaysizmi?',
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: 'Bekor qilish',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.cancelOrder(order.id);
              await refresh();
              await load();
            } catch (e) {
              const err = e as ApiError;
              Alert.alert('Xatolik', err.message || 'Bekor qilib bo‘lmadi');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  if (error && !order) {
    return (
      <Screen>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{error}</Text>
        <Pressable onPress={() => void load()} style={[styles.refresh, { borderColor: colors.border, marginTop: 12 }]}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Qayta urinish</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!order) return <Screen><Text>Yuklanmoqda...</Text></Screen>;

  const pay = String(order.paymentStatus || '');
  const resExpired = Boolean(order.reservationExpired) || (msLeft != null && msLeft <= 0 && order.reservationStatus === 'ACTIVE');

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>{order.code}</Text>
        <Pressable onPress={() => void load()} hitSlop={8}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Yangilash</Text>
        </Pressable>
      </View>

      <Text style={[styles.axis, { color: colors.foreground }]}>
        {fulfillmentLabel(order.fulfillmentStatus)}
      </Text>
      <Text style={[styles.axisSub, { color: colors.mutedForeground }]}>
        To‘lov: {paymentLabel(order.paymentStatus)}
      </Text>
      <Text style={[styles.axisSub, { color: resExpired ? '#B45309' : colors.mutedForeground }]}>
        Bron: {reservationLabel(order.reservationStatus, resExpired)}
      </Text>

      {pay === 'PENDING' ? (
        <Text style={[styles.note, { color: '#B45309' }]}>
          Buyurtma yaratildi ≠ to‘lov amalga oshirilgan. To‘lov holati alohida.
        </Text>
      ) : null}
      {pay === 'FAILED' ? (
        <Text style={[styles.note, { color: '#B91C1C' }]}>
          To‘lov muvaffaqiyatsiz. Production PSP retry o‘chirilgan — filialda to‘lang yoki qo‘llab-quvvatlashga murojaat qiling.
        </Text>
      ) : null}
      {pay === 'REFUNDED' || pay === 'PARTIALLY_REFUNDED' ? (
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Refund holati serverdan. Cashback avtomatik o‘zgarmaydi.
        </Text>
      ) : null}

      {order.reservationActive && order.reservedUntil && msLeft != null && msLeft > 0 ? (
        <View style={[styles.countdown, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Bron tugashiga (taxminiy)</Text>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 4 }}>
            {formatCountdown(msLeft)}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
            Server muddati asosiy — qurilma taymeri faqat UX
          </Text>
        </View>
      ) : null}

      {resExpired && order.fulfillmentStatus !== 'CANCELLED' && order.fulfillmentStatus !== 'COMPLETED' ? (
        <Text style={[styles.note, { color: '#B45309' }]}>
          Bron muddati tugagan. Yangi buyurtma uchun katalog/savatga qayting.
        </Text>
      ) : null}

      <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>
        {order.branch?.name} · {order.fulfillment === 'delivery' ? 'Yetkazib berish' : 'Filialdan olish'}
      </Text>

      {order.fulfillmentStatus !== 'CANCELLED' && order.reservationStatus !== 'EXPIRED' ? (
        <View style={[styles.qr, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 18 }}>{order.qrPayload}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>Kassada shu kodni ko‘rsating</Text>
        </View>
      ) : null}

      {order.items.map((item: any) => (
        <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
          <Text style={{ flex: 1, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
            {item.title} × {item.quantity}
          </Text>
          <Text style={{ color: colors.primary }}>{formatUzs(item.price * item.quantity)}</Text>
        </View>
      ))}

      <View style={{ marginTop: 12, gap: 6 }}>
        {moneyRows.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: r.bold ? 'Inter_700Bold' : 'Inter_400Regular' }}>
              {r.label}
            </Text>
            <Text style={{ color: colors.foreground, fontFamily: r.bold ? 'Inter_700Bold' : 'Inter_600SemiBold' }}>
              {r.value}
            </Text>
          </View>
        ))}
      </View>

      {order.canCancel ? (
        <Pressable
          disabled={cancelling}
          onPress={onCancel}
          style={[styles.cancel, { borderColor: colors.destructive, opacity: cancelling ? 0.5 : 1 }]}
        >
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold' }}>
            {cancelling ? 'Bekor qilinmoqda...' : 'Bekor qilish'}
          </Text>
        </Pressable>
      ) : null}

      {order.canRate ? (
        <Pressable
          onPress={() => router.push({ pathname: '/rating', params: { orderId: String(order.id) } })}
          style={[styles.rateBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Filial xizmatini baholash</Text>
        </Pressable>
      ) : null}
      {order.alreadyRated ? (
        <Text style={{ marginTop: 12, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>
          Bu buyurtma baholangan
        </Text>
      ) : null}

      <Pressable onPress={() => router.push('/(tabs)/catalog')} style={{ marginTop: 16, marginBottom: 24 }}>
        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
          Katalogga qaytish
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  axis: { fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 4 },
  axisSub: { fontFamily: 'Inter_500Medium', fontSize: 13, marginBottom: 2 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 8 },
  countdown: { marginTop: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  qr: { borderRadius: 20, padding: 18, marginVertical: 16 },
  row: { borderBottomWidth: 1, paddingVertical: 10, flexDirection: 'row' },
  cancel: { marginTop: 18, minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rateBtn: { marginTop: 14, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  refresh: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
