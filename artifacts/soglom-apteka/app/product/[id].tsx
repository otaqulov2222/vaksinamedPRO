import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, formatUzs } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { refresh } = useApp();
  const [data, setData] = useState<any>(null);
  useEffect(() => { void api.product(Number(id)).then(setData); }, [id]);
  if (!data?.product) return <Screen><Text>Yuklanmoqda...</Text></Screen>;
  const product = data.product;
  return (
    <Screen>
      <View style={[styles.art, { backgroundColor: colors.secondary }]}><MaterialCommunityIcons name={(product.icon as any) || 'pill'} size={64} color={colors.primary} /></View>
      <Text style={[styles.name, { color: colors.foreground }]}>{product.nameUz}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{product.manufacturer} · {product.category}</Text>
      {product.requiresPrescription ? <Text style={[styles.rx, { color: colors.destructive }]}>Retsept talab qilinadi. Filialda ko‘rsatiladi.</Text> : null}
      <Text style={[styles.price, { color: colors.primary }]}>{formatUzs(product.price)}</Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>{product.description}</Text>
      <Pressable onPress={async () => { await api.addToCart(product.id); await refresh(); Alert.alert('Savat', 'Mahsulot qo‘shildi'); router.push('/cart'); }} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={styles.buttonText}>Savatga qo‘shish</Text>
      </Pressable>
      {data.analogs?.filter((item: any) => item.id !== product.id).length ? (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.name, { color: colors.foreground, fontSize: 18 }]}>Analoglar</Text>
          {data.analogs.filter((item: any) => item.id !== product.id).map((item: any) => (
            <Pressable key={item.id} onPress={() => router.push(`/product/${item.id}`)} style={[styles.analog, { borderColor: colors.border }]}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{item.nameUz}</Text>
              <Text style={{ color: colors.primary }}>{formatUzs(item.price)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: { height: 160, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6 },
  rx: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 },
  price: { fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 12 },
  desc: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 12 },
  button: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold' },
  analog: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
});
