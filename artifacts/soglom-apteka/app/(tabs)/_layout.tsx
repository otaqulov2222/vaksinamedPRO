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

const PRIMARY = '#6A22D6';
const DEEP = '#1A1040';
const INACTIVE = '#8E8E93';

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
      stiffness: 300,
      damping: 24,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [focused, reduceMotion]);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <Animated.View style={[styles.tabIconWrapper, { transform: [{ scale }] }]}>
      <Feather name={name} size={21} color={focused ? PRIMARY : color} />
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
            <QrIcon size={22} color="#FFFFFF" strokeWidth={2.3} />
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
          backgroundColor: isWeb ? 'rgba(255, 255, 255, 0.86)' : '#FFFFFF',
          borderTopColor: 'rgba(0, 0, 0, 0.08)',
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          height: isWeb ? 70 : 60,
          paddingTop: 6,
          paddingBottom: isWeb ? 8 : 4,
          ...(isWeb
            ? ({
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              } as any)
            : {}),
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 10,
          lineHeight: 13,
          marginBottom: isWeb ? 4 : 2,
          alignSelf: 'stretch',
          marginHorizontal: -5,
          maxWidth: 200,
          textAlign: 'center',
          letterSpacing: -0.1,
        },
        tabBarIconStyle: {
          marginTop: 2,
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
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px 3px 12px rgba(106, 34, 214, 0.32), 0px 1px 3px rgba(0, 0, 0, 0.08)',
        } as any)
      : {}),
  },
  qrButtonInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px 1px 0px rgba(255, 255, 255, 0.3) inset',
        } as any)
      : {}),
  },
});
