import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { Screen } from '@/components/AppUI';
import { useColors } from '@/hooks/useColors';

const tags = ['Loyiha', 'Mehribon', 'Professional', 'Tez xizmat', 'Savolimga javob berdi'];

export default function RatingScreen() {
  const colors = useColors();
  const { t } = useApp();
  const [rating, setRating] = useState(4);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const submit = () => { if (!rating) return; Alert.alert(t('thankYou'), 'Sizning bahoyingiz saqlandi.'); router.back(); };
  return (
    <Screen>
      <View style={styles.employee}><View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Feather name="user" size={37} color={colors.primary} /></View><Text style={[styles.name, { color: colors.foreground }]}>Dilnoza Ahmedova</Text><Text style={[styles.role, { color: colors.mutedForeground }]}>Farmatsevt</Text><Text style={[styles.branch, { color: colors.mutedForeground }]}><Feather name="map-pin" size={12} color={colors.mutedForeground} /> Sog‘lom apteka №12</Text></View>
      <Text style={[styles.question, { color: colors.foreground }]}>{t('selectRating')}</Text>
      <View style={styles.stars}>{[1, 2, 3, 4, 5].map((item) => <Pressable key={item} onPress={() => setRating(item)}><Feather name="star" size={34} color={item <= rating ? '#e7ad17' : colors.border} fill={item <= rating ? '#e7ad17' : 'transparent'} /></Pressable>)}</View>
      <View style={styles.tags}>{tags.map((tag) => { const active = selected.includes(tag); return <Pressable key={tag} onPress={() => setSelected((prev) => active ? prev.filter((item) => item !== tag) : [...prev, tag])} style={[styles.tag, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.primary : colors.border }]}><Text style={[styles.tagText, { color: active ? colors.primary : colors.mutedForeground }]}>{tag}</Text></Pressable>; })}</View>
      <TextInput value={comment} onChangeText={setComment} placeholder="Izoh qoldirish (ixtiyoriy)" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={5} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} />
      <Pressable onPress={submit} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}><Text style={styles.submitText}>{t('send')}</Text><Feather name="arrow-right" size={17} color="#fff" /></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  employee: { alignItems: 'center', paddingVertical: 11 },
  avatar: { width: 94, height: 94, borderRadius: 47, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  role: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  branch: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 10 },
  question: { fontFamily: 'Inter_700Bold', fontSize: 17, textAlign: 'center', marginTop: 25 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 17 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 22 },
  tag: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9 },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  input: { minHeight: 120, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 22, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', fontSize: 12 },
  submit: { minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 13 },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 },
});