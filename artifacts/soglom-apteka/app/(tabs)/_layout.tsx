import React from 'react';
import { Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === 'web';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, elevation: 0, height: isWeb ? 84 : 66, paddingTop: 7 },
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginBottom: isWeb ? 14 : 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bosh sahifa', tabBarIcon: ({ color }) => <Feather name="home" size={21} color={color} /> }} />
      <Tabs.Screen name="cashback" options={{ title: 'Cashback', tabBarIcon: ({ color }) => <Feather name="credit-card" size={21} color={color} /> }} />
      <Tabs.Screen name="bonuses" options={{ title: 'Bonuslar', tabBarIcon: ({ color }) => <Feather name="gift" size={21} color={color} /> }} />
      <Tabs.Screen name="purchases" options={{ title: 'Xaridlar', tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={21} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ color }) => <Feather name="user" size={21} color={color} /> }} />
    </Tabs>
  );
}
