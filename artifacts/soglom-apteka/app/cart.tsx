import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api, type ApiError } from '@/lib/api';

const PRICE_SNAP_KEY = 'vaksinamed-cart-price-snap';

type PriceSnap = Record<string, number>;

async function readSnap(): Promise<PriceSnap> {
  try {
    const raw = await AsyncStorage.getItem(PRICE_SNAP_KEY);
    return raw ? (JSON.parse(raw) as PriceSnap) : {};
  } catch {
    return {};
  }
}

async function writeSnap(items: any[]) {
  const next: PriceSnap = {};
  for (const item of items) {
    const price = Number(item.unitPrice ?? item.product?.price);
    if (Number.isFinite(price)) next[String(item.id)] = price;
  }
  await AsyncStorage.setItem(PRICE_SNAP_KEY, JSON.stringify(next));
}

export default function CartScreen() {
  const colors = useColors();
  const { t, refresh } = useApp();
  const [cart, setCart] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [priceFlags, setPriceFlags] = useState<Record<string, { previous: number; current: number }>>({});
  const [notices, setNotices] = useState<Array<{ code: string; message: string }>>([]);

  const load = async () => {
    try {
      const data = await api.cart();
      const prev = await readSnap();
      const flags: Record<string, { previous: number; current: number }> = {};
      for (const item of data.items || []) {
        const key = String(item.id);
        const current = Number(item.unitPrice ?? item.product?.price);
        const previous = prev[key];
        if (
          previous != null
          && Number.isFinite(previous)
          && Number.isFinite(current)
          && previous !== current
        ) {
          flags[key] = { previous, current };
        }
      }
      setPriceFlags(flags);
      setNotices(Array.isArray(data.notices) ? data.notices : []);
      setCart(data);
      setError(null);
      await writeSnap(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Savat yuklanmadi');
    }
  };

  useEffect(() => { void load(); }, []);

  const changeQty = async (item: any, nextQty: number) => {
    if (busyId != null) return;
    setBusyId(item.id);
    try {
      await api.updateCartItem(item.id, nextQty);
      await load();
      await refresh();
    } catch (e) {
      const err = e as ApiError;
      Alert.alert(
        err.code === 'STOCK_UNAVAILABLE' ? 'Qoldiq' : 'Xatolik',
        err.message || 'Miqdor yangilanmadi',
      );
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (error && !cart) {
    return (
      <Screen>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{error}</Text>
        <Pressable onPress={() => void load()} style={[styles.button, { backgroundColor: colors.primary, marginTop: 12 }]}>
          <Text style={styles.buttonText}>Qayta urinish</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!cart) return <Screen><Text>Yuklanmoqda...</Text></Screen>;

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('cart')}</Text>
      {notices.map((n, i) => (
        <Text key={`${n.code}-${i}`} style={{ color: '#B45309', fontSize: 12, marginBottom: 6, fontFamily: 'Inter_500Medium' }}>
          {n.message}
        </Text>
      ))}
      {!cart.items.length ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>{t('noData')}</Text>
      ) : null}
      {cart.items.map((item: any) => {
        const flag = priceFlags[String(item.id)];
        return (
          <View key={item.id} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.foreground }]}>{item.product.nameUz}</Text>
              <Text style={{ color: colors.primary, marginTop: 4 }}>{formatUzs(item.lineTotal)}</Text>
              {flag ? (
                <Text style={{ color: '#B45309', fontSize: 11, marginTop: 4 }}>
                  Narx o‘zgargan: {formatUzs(flag.previous)} → {formatUzs(flag.current)} (joriy katalog)
                </Text>
              ) : null}
              {item.stockInsufficient ? (
                <Text style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>
                  Mavjud miqdor o‘zgargan (mavjud: {item.available ?? 0})
                </Text>
              ) : item.availabilityKnown ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                  Filialda mavjud (taxminiy): {item.available ?? 0}
                </Text>
              ) : (
                <Text style={{ color: '#B45309', fontSize: 11, marginTop: 4 }}>
                  Filial tanlanmagan — qoldiq ko‘rsatilmaydi
                </Text>
              )}
            </View>
            <View style={styles.qty}>
              <Pressable disabled={busyId === item.id} onPress={() => void changeQty(item, item.quantity - 1)}>
                <Text style={styles.qtyBtn}>−</Text>
              </Pressable>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>{item.quantity}</Text>
              <Pressable disabled={busyId === item.id} onPress={() => void changeQty(item, item.quantity + 1)}>
                <Text style={styles.qtyBtn}>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {cart.branch ? (
        <Text style={{ marginTop: 12, color: colors.mutedForeground }}>{cart.branch.name}</Text>
      ) : (
        <Text style={{ marginTop: 12, color: '#B45309', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
          Filial tanlanmagan — checkoutda tanlang
        </Text>
      )}
      <Text style={{ marginTop: 8, color: colors.mutedForeground, fontSize: 11 }}>
        Summalar joriy katalog narxidan — yakuniy hisob serverda.
      </Text>
      <Text style={[styles.total, { color: colors.foreground }]}>{formatUzs(cart.subtotal)}</Text>
      <Pressable
        disabled={!cart.items.length}
        onPress={() => router.push('/checkout')}
        style={[styles.button, { backgroundColor: colors.primary, opacity: cart.items.length ? 1 : 0.5 }]}
      >
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
