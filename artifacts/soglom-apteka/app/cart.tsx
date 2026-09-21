import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

export default function CartScreen() {
  const colors = useColors();
  const { t, refresh } = useApp();
  const [cart, setCart] = useState<any>(null);
  const load = async () => setCart(await api.cart());
  useEffect(() => { void load(); }, []);
  if (!cart) return <Screen><Text>Yuklanmoqda...</Text></Screen>;
  return (
    <Screen>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('cart')}</Text>
      {!cart.items.length ? <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>{t('noData')}</Text> : null}
      {cart.items.map((item: any) => (
        <View key={item.id} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.foreground }]}>{item.product.nameUz}</Text>
            <Text style={{ color: colors.primary, marginTop: 4 }}>{formatUzs(item.lineTotal)}</Text>
          </View>
          <View style={styles.qty}>
            <Pressable onPress={async () => { await api.updateCartItem(item.id, item.quantity - 1); await load(); await refresh(); }}><Text style={styles.qtyBtn}>−</Text></Pressable>
            <Text style={{ fontFamily: 'Inter_700Bold' }}>{item.quantity}</Text>
            <Pressable onPress={async () => { await api.updateCartItem(item.id, item.quantity + 1); await load(); await refresh(); }}><Text style={styles.qtyBtn}>+</Text></Pressable>
          </View>
        </View>
      ))}
      {cart.branch ? <Text style={{ marginTop: 12, color: colors.mutedForeground }}>{cart.branch.name}</Text> : null}
      <Text style={[styles.total, { color: colors.foreground }]}>{formatUzs(cart.subtotal)}</Text>
      <Pressable disabled={!cart.items.length} onPress={() => router.push('/checkout')} style={[styles.button, { backgroundColor: colors.primary, opacity: cart.items.length ? 1 : 0.5 }]}>
        <Text style={styles.buttonText}>{t('checkout')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, marginBottom: 16 },
  row: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { fontSize: 20, width: 28, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  total: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 16 },
  button: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold' },
});
