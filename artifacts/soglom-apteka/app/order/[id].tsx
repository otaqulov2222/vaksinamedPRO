import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { refresh } = useApp();
  const [order, setOrder] = useState<any>(null);
  const load = async () => setOrder((await api.order(Number(id))).order);
  useEffect(() => { void load(); }, [id]);
  if (!order) return <Screen><Text>Yuklanmoqda...</Text></Screen>;
  return (
    <Screen>
      <Text style={[styles.title, { color: colors.foreground }]}>{order.code}</Text>
      <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', marginBottom: 8 }}>{order.status}</Text>
      <Text style={{ color: colors.mutedForeground }}>{order.branch?.name} · {order.fulfillment === 'delivery' ? 'Yetkazib berish' : 'Filialdan olish'}</Text>
      <View style={[styles.qr, { backgroundColor: colors.primary }]}>
        <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 18 }}>{order.qrPayload}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>Kassada shu kodni ko‘rsating</Text>
      </View>
      {order.items.map((item: any) => (
        <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
          <Text style={{ flex: 1, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.title} × {item.quantity}</Text>
          <Text style={{ color: colors.primary }}>{formatUzs(item.price * item.quantity)}</Text>
        </View>
      ))}
      <Text style={[styles.total, { color: colors.foreground }]}>{formatUzs(order.total)}</Text>
      {order.status !== 'completed' && order.status !== 'cancelled' ? (
        <Pressable onPress={async () => { await api.cancelOrder(order.id); await refresh(); await load(); }} style={[styles.cancel, { borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold' }}>Bekor qilish</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  qr: { borderRadius: 20, padding: 18, marginVertical: 16 },
  row: { borderBottomWidth: 1, paddingVertical: 10, flexDirection: 'row' },
  total: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 16 },
  cancel: { marginTop: 18, minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
