import { Feather } from '@/components/AppIcon';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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

function isDesktopShell(ua: string): boolean {
  return /Electron|VaksinaMedDesktop/i.test(ua);
}

function isPhoneForm(ua: string, platform: string): boolean {
  if (isDesktopShell(ua)) return false;
  if (/Android|iPhone|iPad/i.test(ua)) return true;
  const p = platform.toLowerCase();
  return p === 'ios' || p === 'android';
}

function detectBrowser(ua: string, t: TFunction): string {
  if (/Edg\//i.test(ua)) return t('profile.devicesBrowserEdge');
  if (/OPR\/|Opera/i.test(ua)) return t('profile.devicesBrowserOpera');
  if (/Firefox\//i.test(ua)) return t('profile.devicesBrowserFirefox');
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return t('profile.devicesBrowserChrome');
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return t('profile.devicesBrowserSafari');
  return '';
}

/** Prefer device model from Android UA, e.g. "Pixel 10". */
function androidModel(ua: string): string | null {
  const m = ua.match(/Android[^;]*;\s*([^);]+)\)/i);
  const model = m?.[1]?.trim();
  if (!model) return null;
  if (/^wv$|^Linux$/i.test(model)) return null;
  return model;
}

function friendlyDeviceTitle(platform: string, userAgent: string | null, t: TFunction): string {
  const ua = userAgent || '';
  const p = platform.toLowerCase();

  if (isDesktopShell(ua)) return t('profile.devicesDesktop');

  if (/Android/i.test(ua)) {
    const model = androidModel(ua);
    if (model) return model;
    const ver = ua.match(/Android\s+([\d.]+)/i)?.[1];
    return ver ? t('profile.devicesAndroidVersion', { version: ver }) : t('profile.devicesPlatformAndroid');
  }
  if (/iPhone/i.test(ua)) return t('profile.devicesIphone');
  if (/iPad/i.test(ua)) return t('profile.devicesIpad');
  if (/Windows NT/i.test(ua)) return t('profile.devicesWindows');
  if (/Macintosh|Mac OS X/i.test(ua)) return t('profile.devicesMac');
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return t('profile.devicesLinux');

  if (p === 'ios') return t('profile.devicesPlatformIos');
  if (p === 'android') return t('profile.devicesPlatformAndroid');
  if (p === 'web') return t('profile.devicesPlatformWeb');
  return t('profile.devicesUnknown');
}

function friendlyDeviceSubtitle(platform: string, userAgent: string | null, t: TFunction): string | null {
  if (!userAgent) return null;
  const phone = isPhoneForm(userAgent, platform);
  const kind = phone ? t('profile.devicesFormPhone') : t('profile.devicesFormDesktop');
  const browser = detectBrowser(userAgent, t);

  if (isDesktopShell(userAgent)) {
    const detail = browser || t('profile.devicesDesktopShellPlain');
    return t('profile.devicesKindLine', { kind, detail });
  }
  if (browser) return t('profile.devicesKindLine', { kind, detail: browser });
  return kind;
}

function platformIcon(
  platform: string,
  userAgent: string | null,
): React.ComponentProps<typeof Feather>['name'] {
  const ua = userAgent || '';
  return isPhoneForm(ua, platform) ? 'smartphone' : 'monitor';
}

function isCurrentDevice(storedUa: string | null, currentUa: string): boolean {
  if (!storedUa || !currentUa) return false;
  if (storedUa === currentUa) return true;
  // Same desktop shell session family (version suffix may differ after rebuild).
  if (isDesktopShell(storedUa) && isDesktopShell(currentUa)) return true;
  return false;
}

/** Real desktop session (Electron or Windows/Mac Chrome without mobile UA). */
function isDesktopViewer(ua: string): boolean {
  if (isDesktopShell(ua)) return true;
  if (/Windows NT|Macintosh|Mac OS X/i.test(ua) && !/Android|iPhone|iPad/i.test(ua)) return true;
  return false;
}

/**
 * Heuristic: mobile UA while the browser chrome is much wider than the page
 * (typical Chrome DevTools device toolbar + side panel).
 */
function isLikelyDevtoolsPhoneEmulation(ua: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!/Android|iPhone|iPad/i.test(ua) || isDesktopShell(ua)) return false;
  try {
    return window.outerWidth > window.innerWidth + 240;
  } catch {
    return false;
  }
}

export default function DevicesScreen() {
  const insets = useSafeAreaInsets();
  const { t, fmt } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const currentUa = useMemo(
    () => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''),
    [],
  );
  const emulationHint = useMemo(() => isLikelyDevtoolsPhoneEmulation(currentUa), [currentUa]);
  const desktopViewer = useMemo(() => isDesktopViewer(currentUa), [currentUa]);

  const load = useCallback(
    async (pull = false) => {
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
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={PRIMARY} />
        }
      >
        <Text style={styles.lead}>{t('profile.devicesDesc')}</Text>

        {emulationHint ? (
          <View style={styles.hint} testID="devices-emulation-hint">
            <Feather name="info" size={16} color={PRIMARY} />
            <Text style={styles.hintText}>{t('profile.devicesEmulationHint')}</Text>
          </View>
        ) : null}

        {!loading && desktopViewer && devices.length > 0 && !devices.some((d) => isCurrentDevice(d.userAgent, currentUa)) ? (
          <View style={styles.hint} testID="devices-desktop-missing-hint">
            <Feather name="monitor" size={16} color={PRIMARY} />
            <Text style={styles.hintText}>{t('profile.devicesDesktopMissingHint')}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="monitor" size={28} color={MUTED} />
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
            const subtitle = friendlyDeviceSubtitle(dev.platform, dev.userAgent, t);
            const current = isCurrentDevice(dev.userAgent, currentUa);
            return (
              <View key={dev.id} style={styles.card} testID={`device-row-${dev.id}`}>
                <View style={styles.iconWrap}>
                  <Feather name={platformIcon(dev.platform, dev.userAgent)} size={18} color={PRIMARY} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {friendlyDeviceTitle(dev.platform, dev.userAgent, t)}
                    </Text>
                    {current ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{t('profile.devicesCurrent')}</Text>
                      </View>
                    ) : null}
                  </View>
                  {subtitle ? (
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                  <Text style={styles.cardMeta}>
                    {t('profile.devicesLastUsed')}:{' '}
                    {when ? fmt.date(when, { withTime: true }) : '—'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 20, maxWidth: 440, width: '100%', alignSelf: 'center', gap: 12 },
  lead: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: MUTED, marginBottom: 4 },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F1EBFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  hintText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, color: DEEP },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: INK },
  emptyHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 8,
  },
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
  cardBody: { flex: 1, gap: 4, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 15, color: DEEP },
  badge: { backgroundColor: '#F1EBFF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: PRIMARY },
  cardMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, color: MUTED },
});
