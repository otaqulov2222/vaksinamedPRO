import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { router } from 'expo-router';

function CenterQrButton() {
  return (
    <Pressable
      accessibilityLabel="Mening QR kodim"
      onPress={() => router.push('/qr')}
      style={({ pressed }) => [styles.centerQrButton, { opacity: pressed ? 0.88 : 1 }]}
    >
      <View style={styles.qrButtonInner}>
        <MaterialCommunityIcons name="qrcode" size={26} color="#120724" />
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
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          height: isWeb ? 84 : 66,
          paddingTop: 7,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 10,
          marginBottom: isWeb ? 14 : 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bosh sahifa',
          tabBarIcon: ({ color }) => <Feather name="home" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Katalog',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-grid" size={21} color={color} />,
        }}
      />
      <Tabs.Screen name="bonuses" options={{ title: 'QR kod', tabBarButton: () => <CenterQrButton /> }} />
      <Tabs.Screen
        name="purchases"
        options={{
          title: 'Buyurtmalar',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="medical-bag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <Feather name="user" size={21} color={color} />,
        }}
      />
      <Tabs.Screen name="cashback" options={{ href: null }} />
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
    backgroundColor: '#FFCC00',
    borderWidth: 4,
    borderColor: '#fcfaff',
    elevation: 8,
    shadowColor: '#C9A000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  qrButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFCC00',
  },
});
