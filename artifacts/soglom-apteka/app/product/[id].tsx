import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { refresh } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const loadGen = useRef(0);

  const load = useCallback(() => {
    const productId = Number(id);
    if (!Number.isInteger(productId) || productId <= 0) {
      setData(null);
      setError('Mahsulot topilmadi');
      setLoading(false);
      return;
    }
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    void (async () => {
      let branchId: number | undefined;
      try {
        const cart = await api.cart();
        const raw = cart?.branch?.id ?? cart?.cart?.branchId;
        if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) {
          branchId = Number(raw);
        }
      } catch {
        // cart optional for product browse
      }
      try {
        const res = await api.product(productId, branchId ? { branchId } : undefined);
        if (gen !== loadGen.current) return;
        setData(res);
      } catch (err: any) {
        if (gen !== loadGen.current) return;
        setData(null);
        setError(
          err?.status === 404
            ? 'Mahsulot topilmadi'
            : err?.message || 'Mahsulotni yuklab bo‘lmadi',
        );
      } finally {
        if (gen === loadGen.current) setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    load();
    return () => {
      loadGen.current += 1;
    };
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>Yuklanmoqda...</Text>
        </View>
      </Screen>
    );
  }

  if (error || !data?.product) {
    return (
      <Screen>
        <View style={styles.state}>
          <MaterialCommunityIcons name="package-variant-closed" size={44} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            {error || 'Mahsulot topilmadi'}
          </Text>
          <Pressable
            onPress={load}
            style={[styles.button, { backgroundColor: colors.primary, marginTop: 16 }]}
          >
            <Text style={styles.buttonText}>Qayta urinish</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const product = data.product;
  const availability: Array<{
    branchId: number;
    availableQuantity: number;
    physicalQuantity: number;
    reservedQuantity: number;
  }> = Array.isArray(data.availability) ? data.availability : [];
  const scoped = Boolean(data.availabilityScoped);
  const totalAvailable = scoped && data.availableQuantity != null
    ? Math.max(0, Number(data.availableQuantity) || 0)
    : availability.reduce(
      (sum, row) => sum + Math.max(0, Number(row.availableQuantity) || 0),
      0,
    );
  const hasStockData = scoped || availability.length > 0;
  const outOfStock = hasStockData && totalAvailable <= 0;
  const iconName =
    product.icon && product.icon in MaterialCommunityIcons.glyphMap
      ? product.icon
      : 'pill';

  const onAdd = async () => {
    if (adding || outOfStock) return;
    setAdding(true);
    try {
      await api.addToCart(product.id, 1);
      await refresh();
      Alert.alert('Savat', 'Mahsulot qo‘shildi');
      router.push('/cart');
    } catch (err) {
      Alert.alert('Xatolik', err instanceof Error ? err.message : 'Savatga qo‘shilmadi');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Screen>
      <View style={[styles.art, { backgroundColor: colors.secondary }]}>
        <MaterialCommunityIcons name={iconName as any} size={64} color={colors.primary} />
      </View>
      <Text style={[styles.name, { color: colors.foreground }]}>{product.nameUz}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        {product.manufacturer} · {product.category}
      </Text>
      {product.requiresPrescription ? (
        <Text style={[styles.rx, { color: colors.destructive }]}>
          Retsept talab qilinadi. Filialda ko‘rsatiladi.
        </Text>
      ) : null}
      <Text style={[styles.price, { color: colors.primary }]}>{formatUzs(product.price)}</Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>{product.description}</Text>

      {hasStockData ? (
        <View style={styles.stockBox}>
          <Text style={[styles.stockTitle, { color: colors.foreground }]}>
            {scoped ? 'Mavjudlik (tanlangan filial)' : 'Mavjudlik (filiallar)'}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
            available = physical − reserved
          </Text>
          {outOfStock ? (
            <Text style={[styles.rx, { color: colors.destructive, marginTop: 8 }]}>
              {scoped ? 'Tanlangan filialda mavjud emas' : 'Hozircha omborda mavjud emas'}
            </Text>
          ) : scoped ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}>
              Filial #{data.selectedBranchId}: {totalAvailable} ta
            </Text>
          ) : (
            availability
              .filter((row) => Number(row.availableQuantity) > 0)
              .slice(0, 8)
              .map((row) => (
                <Text
                  key={row.branchId}
                  style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}
                >
                  Filial #{row.branchId}: {row.availableQuantity} ta
                </Text>
              ))
          )}
        </View>
      ) : (
        <Text style={[styles.meta, { marginTop: 12 }]}>
          Filial tanlanmagan — aniq qoldiq ko‘rsatilmaydi. Yakuniy tekshiruv buyurtmada.
        </Text>
      )}

      <Pressable
        onPress={() => void onAdd()}
        disabled={adding || outOfStock}
        style={[
          styles.button,
          { backgroundColor: colors.primary, opacity: adding || outOfStock ? 0.55 : 1 },
        ]}
      >
        {adding ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {outOfStock ? 'Mavjud emas' : 'Savatga qo‘shish'}
          </Text>
        )}
      </Pressable>

      {data.analogs?.filter((item: any) => item.id !== product.id).length ? (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.name, { color: colors.foreground, fontSize: 18 }]}>Analoglar</Text>
          {data.analogs
            .filter((item: any) => item.id !== product.id)
            .map((item: any) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/product/${item.id}`)}
                style={[styles.analog, { borderColor: colors.border }]}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
                  {item.nameUz}
                </Text>
                <Text style={{ color: colors.primary }}>{formatUzs(item.price)}</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center' },
  art: { height: 160, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6 },
  rx: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 },
  price: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 12 },
  desc: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 12 },
  stockBox: { marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: '#F5F4FA' },
  stockTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  button: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold' },
  analog: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
