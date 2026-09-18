import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { PropsWithChildren } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export const formatUzs = (value: number) => `${new Intl.NumberFormat('uz-UZ').format(value)} so‘m`;

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const content = (
    <View style={[
      styles.screen,
      { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8, paddingBottom: Platform.OS === 'web' ? 34 : 16 },
    ]}>
      {children}
    </View>
  );
  return scroll ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>{content}</ScrollView> : content;
}

export function IconButton({ icon, onPress, badge }: { icon: keyof typeof Feather.glyphMap; onPress?: () => void; badge?: boolean }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Feather name={icon} size={20} color={colors.foreground} />
      {badge ? <View style={[styles.badgeDot, { backgroundColor: colors.destructive }]} /> : null}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionHeading, { color: colors.foreground }]}>{title}</Text>
      {action ? <Pressable onPress={onPress}><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function ActionTile({ icon, label, onPress, tint = 'green' }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress?: () => void; tint?: 'green' | 'gold' | 'mint' | 'pink' }) {
  const colors = useColors();
  const backgrounds = { green: colors.accent, gold: '#fff2cf', mint: '#eee3f7', pink: '#fde7ed' };
  const iconColors = { green: colors.primary, gold: '#d69b0a', mint: '#603085', pink: '#d54d73' };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionTile, { opacity: pressed ? 0.74 : 1 }]}>
      <View style={[styles.actionIcon, { backgroundColor: backgrounds[tint] }]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColors[tint]} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export function ProgressLine({ progress }: { progress: number }) {
  const colors = useColors();
  return <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} /></View>;
}

export function Chevron() {
  const colors = useColors();
  return <Feather name="chevron-right" size={20} color={colors.mutedForeground} />;
}

export function Pill({ children, active = false }: PropsWithChildren<{ active?: boolean }>) {
  const colors = useColors();
  return <View style={[styles.pill, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}><Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 20 },
  scrollContent: { flexGrow: 1 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  badgeDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: '#fff' },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 13 },
  sectionHeading: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  sectionAction: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  actionTile: { alignItems: 'center', width: '25%', gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});