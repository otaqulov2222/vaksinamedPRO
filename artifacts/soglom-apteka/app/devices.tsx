import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialogs';
import type { TFunction } from '@/lib/i18n';

const PRIMARY = '#4B248A';
const DEEP = '#351765';
const BG = '#F7F6FA';
const SURFACE = '#FFFFFF';
const INK = '#17162C';
const MUTED = '#64748B';
const BORDER = '#EFEBF6';

type DeviceRow = {
  id: number;
  platform: string;
  userAgent: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

function platformLabel(platform: string, t: TFunction): string {
  const p = platform.toLowerCase();
  if (p === 'ios') return t('profile.devicesPlatformIos');
  if (p === 'android') return t('profile.devicesPlatformAndroid');
  if (p === 'web') return t('profile.devicesPlatformWeb');
  return t('profile.devicesUnknown');
}

function platformIcon(platform: string): React.ComponentProps<typeof Feather>['name'] {
  const p = platform.toLowerCase();
  if (p === 'ios' || p === 'android') return 'smartphone';
  return 'monitor';
}

export default function DevicesScreen() {
  const insets = useSafeAreaInsets();
  const { t, fmt } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.getDevices();
      setDevices(Array.isArray(res.devices) ? res.devices : []);
    } catch {
      notify(t('common.errorTitle'), t('common.errorGeneric'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={PRIMARY} />}
      >
        <Text style={styles.lead}>{t('profile.devicesDesc')}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="smartphone" size={28} color={MUTED} />
            <Text style={styles.emptyTitle}>{t('profile.devicesEmpty')}</Text>
            <Text style={styles.emptyHint}>{t('profile.devicesEmptyHint')}</Text>
            <Pressable
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={t('common.navNotifications')}
            >
              <Text style={styles.linkText}>{t('common.navNotifications')}</Text>
              <Feather name="chevron-right" size={16} color={PRIMARY} />
            </Pressable>
          </View>
        ) : (
          devices.map((dev) => {
            const when = dev.lastUsedAt || dev.createdAt;
            return (
              <View key={dev.id} style={styles.card} testID={`device-row-${dev.id}`}>
                <View style={styles.iconWrap}>
                  <Feather name={platformIcon(dev.platform)} size={18} color={PRIMARY} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{platformLabel(dev.platform, t)}</Text>
                  {dev.userAgent ? (
                    <Text style={styles.cardMeta} numberOfLines={2}>
                      {dev.userAgent}
                    </Text>
                  ) : null}
                  <Text style={styles.cardMeta}>
                    {t('profile.devicesLastUsed')}: {when ? fmt.date(when, { withTime: true }) : '—'}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
          style={styles.backLink}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backLinkText}>{t('common.back')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 20, maxWidth: 440, width: '100%', alignSelf: 'center', gap: 12 },
  lead: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: MUTED, marginBottom: 4 },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: INK },
  emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, color: MUTED, textAlign: 'center', marginBottom: 8 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: PRIMARY },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: DEEP },
  cardMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, color: MUTED },
  backLink: { alignItems: 'center', paddingVertical: 12 },
  backLinkText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: MUTED },
});
