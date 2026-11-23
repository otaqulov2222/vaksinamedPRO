import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/AppIcon';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useApp } from '@/context/AppContext';

const BANNER_BG = '#1A1040';
const ACCENT = '#FFCC00';

/**
 * Sticky top banner when the device cannot reach the network / API.
 * Sits above all screens (mounted in root layout).
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const { online, retry } = useNetworkStatus();
  const visible = !online;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 8),
          opacity: anim,
          transform: [{ translateY }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      testID="offline-banner"
    >
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Feather name="cloud-off" size={16} color={BANNER_BG} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {t('common.offlineBannerTitle')}
          </Text>
          <Text style={styles.hint} numberOfLines={2}>
            {t('common.offlineBannerHint')}
          </Text>
        </View>
        <Pressable
          onPress={retry}
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.offlineRetry')}
          hitSlop={8}
        >
          <Text style={styles.retryText}>{t('common.offlineRetry')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BANNER_BG,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,204,0,0.35)',
    boxShadow: '0 8px 24px rgba(26,16,64,0.28)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    lineHeight: 17,
    color: '#FFFFFF',
  },
  hint: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.78)',
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
});

export default OfflineBanner;
