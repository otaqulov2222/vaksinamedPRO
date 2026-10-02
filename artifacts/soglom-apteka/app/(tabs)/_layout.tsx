import React from 'react';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
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
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Feather name={name} size={20} color={color} />
    </View>
  );
}

function CenterQrButton() {
  const { t } = useApp();
  return (
    <View style={styles.centerQrSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.navQr')}
        onPress={() => router.push('/qr')}
        style={({ pressed }) => [styles.centerQrButton, pressed && styles.centerQrPressed]}
      >
        <View style={styles.qrButtonInner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <QrIcon size={24} color={DEEP} strokeWidth={2} />
        </View>
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
          borderTopColor: 'rgba(23,22,44,0.06)',
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          boxShadow: '0px -8px 24px rgba(53,23,101,0.06)',
          height: isWeb ? 80 : 64,
          paddingTop: 6,
          paddingBottom: isWeb ? 12 : 4,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          lineHeight: 14,
          marginBottom: isWeb ? 8 : 2,
          // The tab button pads 5px per side and RN-web caps one-line text at max-width 100%;
          // long labels (uz "Buyurtmalar") need the full tab width at 360px.
          alignSelf: 'stretch',
          marginHorizontal: -5,
          maxWidth: 200,
          textAlign: 'center',
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
  tabIcon: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: PURPLE_LIGHT },
  centerQrSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerQrButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 4px rgba(53,23,101,0.08), 0px 10px 22px rgba(53,23,101,0.20)',
  },
  centerQrPressed: { transform: [{ scale: 0.96 }] },
  qrButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: YELLOW,
    boxShadow: '0px 1px 0px rgba(255,255,255,0.55) inset, 0px -2px 6px rgba(53,23,101,0.08) inset',
  },
});
