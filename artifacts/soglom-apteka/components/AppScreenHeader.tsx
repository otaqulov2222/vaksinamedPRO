import { Feather } from '@/components/AppIcon';
import { router, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';

type Props = {
  title: string;
  subtitle?: string;
  fallback?: Href;
  right?: React.ReactNode;
};

/** Single in-screen back + title. Use with Stack headerShown:false to avoid double arrows. */
export function AppScreenHeader({ title, subtitle, fallback = '/(tabs)/profile', right }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useApp();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  };

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, 10) }]}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        hitSlop={10}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Feather name="arrow-left" size={22} color="#2A104E" />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : <View style={styles.rightSpacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE8F5',
    gap: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3EAFB',
  },
  titleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: '#2A104E',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
  },
  right: { minWidth: 40, alignItems: 'flex-end' },
  rightSpacer: { width: 40 },
});
