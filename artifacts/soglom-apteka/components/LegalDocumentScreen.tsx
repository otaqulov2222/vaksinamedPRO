import { Feather } from '@/components/AppIcon';
import { router, Stack } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import type { LegalDoc } from '@/lib/legalContent';

const PURPLE = '#5C328E';
const BG = '#F7F5F2';
const CARD = '#FFFFFF';
const INK = '#2A104E';
const MUTED = '#64748B';

export default function LegalDocumentScreen({ doc }: { doc: LegalDoc }) {
  const insets = useSafeAreaInsets();
  const { t } = useApp();

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/profile');
          }}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Feather name="arrow-left" size={22} color={PURPLE} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {doc.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 28) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>
          {t('profile.legalUpdated', { date: doc.updated })}
        </Text>
        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.card}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: BG,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFE8F8',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: INK,
  },
  content: { paddingHorizontal: 16, gap: 12 },
  updated: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginBottom: 4,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEEAF5',
    padding: 16,
    gap: 8,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: INK,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
  },
});
