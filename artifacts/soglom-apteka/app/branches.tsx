import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

const branches = [
  { name: 'Sog‘lom apteka №12', distance: '1.2 km', address: 'Amir Temur ko‘chasi, 42', open: true },
  { name: 'Sog‘lom apteka №7', distance: '2.4 km', address: 'Shahrisabz ko‘chasi, 18', open: true },
  { name: 'Sog‘lom apteka №3', distance: '4.8 km', address: 'Chilonzor ko‘chasi, 11', open: false },
];

export default function BranchesScreen() {
  const colors = useColors();
  const { t } = useApp();
  return (
    <Screen>
      <View style={[styles.mapPreview, { backgroundColor: colors.secondary }]}><View style={[styles.mapCircle, { backgroundColor: colors.accent }]}><Feather name="map-pin" size={29} color={colors.primary} /></View><Text style={[styles.mapTitle, { color: colors.foreground }]}>Toshkent bo‘ylab {branches.length} ta filial</Text><Text style={[styles.mapText, { color: colors.mutedForeground }]}>Sizga eng yaqin aptekani tanlang</Text></View>
      <View style={styles.list}>{branches.map((branch) => <View key={branch.name} style={[styles.branch, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.icon, { backgroundColor: branch.open ? colors.accent : colors.muted }]}><Feather name="map-pin" size={19} color={branch.open ? colors.primary : colors.mutedForeground} /></View><View style={styles.copy}><Text style={[styles.name, { color: colors.foreground }]}>{branch.name}</Text><Text style={[styles.address, { color: colors.mutedForeground }]}>{branch.address}, Toshkent</Text><Text style={[styles.hours, { color: branch.open ? colors.primary : colors.mutedForeground }]}>{branch.open ? t('openNow') : 'Yopiq'}  ·  08:00 — 22:00</Text></View><View style={styles.actions}><Text style={[styles.distance, { color: colors.foreground }]}>{branch.distance}</Text><Pressable onPress={() => Alert.alert(branch.name, `${t('branchAddress')}\n${t('workingHours')}`)} style={[styles.route, { backgroundColor: colors.secondary }]}><Feather name="navigation" size={14} color={colors.primary} /></Pressable></View></View>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapPreview: { borderRadius: 23, height: 178, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  mapCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  mapTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  mapText: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 6 },
  list: { gap: 10 },
  branch: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center' },
  icon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, marginLeft: 10 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  address: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  hours: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 4 },
  actions: { alignItems: 'flex-end', gap: 8 },
  distance: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  route: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});