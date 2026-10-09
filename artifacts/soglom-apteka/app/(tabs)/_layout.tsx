import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { router } from 'expo-router';
import { QrIcon } from '@/components/LineIcons';
import { useApp } from '@/context/AppContext';

const PRIMARY = '#4B248A';
const DEEP = '#351765';
const PURPLE_LIGHT = '#F1EBFF';
const YELLOW = '#FFD233';
const INACTIVE = 'rgba(107,114,128,0.8)';

type IconName = React.ComponentProps<typeof Feather>['name'];

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
          setReduceMotion(true);
        }
      } catch {
        // Fall through
      }
    } else {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (mounted) setReduceMotion(enabled);
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(focused ? 1 : 0);
      return;
    }
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      stiffness: 280,
      damping: 22,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [focused, reduceMotion]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2.5],
  });

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.05],
  });

  const pillOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Animated.View style={[styles.tabIconWrapper, { transform: [{ translateY }, { scale }] }]}>
      <Animated.View style={[styles.tabPill, { opacity: pillOpacity }]} />
      <Feather name={name} size={20} color={focused ? PRIMARY : color} />
    </Animated.View>
  );
}

function CenterQrButton() {
  const { t } = useApp();
  const pressAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 0.92,
      speed: 30,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      speed: 20,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.centerQrSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.navQr')}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => router.push('/qr')}
        style={styles.centerQrTouchTarget}
      >
        <Animated.View style={[styles.centerQrButton, { transform: [{ scale: pressAnim }] }]}>
          <View style={styles.qrButtonInner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <QrIcon size={24} color={DEEP} strokeWidth={2.2} />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useApp();
  const isWeb = Platform.OS === 'web';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: 'rgba(23,22,44,0.05)',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          elevation: 6,
          shadowOpacity: 0,
          boxShadow: '0px -6px 22px rgba(53,23,101,0.06)',
          height: isWeb ? 78 : 64,
          paddingTop: 8,
          paddingBottom: isWeb ? 10 : 4,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          lineHeight: 14,
          marginBottom: isWeb ? 6 : 2,
          alignSelf: 'stretch',
          marginHorizontal: -5,
          maxWidth: 200,
          textAlign: 'center',
        },
        tabBarIconStyle: {
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('common.navHome'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: t('common.navCatalog'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="grid" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bonuses"
        options={{
          title: t('common.navQr'),
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => <CenterQrButton />,
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: t('common.navOrders'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="shopping-bag" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('common.navProfile'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWrapper: {
    width: 48,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 15,
  },
  centerQrSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerQrTouchTarget: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerQrButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 4px 14px rgba(255,210,51,0.32), 0px 8px 24px rgba(53,23,101,0.18)',
    elevation: 8,
  },
  qrButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: YELLOW,
    boxShadow: '0px 1px 0px rgba(255,255,255,0.65) inset, 0px -2px 6px rgba(53,23,101,0.10) inset',
  },
});
