import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { router } from 'expo-router';

function CenterQrButton() {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel="Mening QR kodim"
      onPress={() => router.push('/qr')}
      style={({ pressed }) => [styles.centerQrButton, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}
    >
      <View style={[styles.qrButtonInner, { backgroundColor: colors.accent }]}>
        <MaterialCommunityIcons name="qrcode-scan" size={27} color={colors.primary} />
      </View>
    </Pressable>
  );
}

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
      <Tabs.Screen name="bonuses" options={{ title: 'QR kod', tabBarButton: () => <CenterQrButton /> }} />
      <Tabs.Screen name="purchases" options={{ title: 'Xaridlar', tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={21} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ color }) => <Feather name="user" size={21} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerQrButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -19,
    borderWidth: 4,
    borderColor: '#fcfaff',
    elevation: 8,
  },
  qrButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
