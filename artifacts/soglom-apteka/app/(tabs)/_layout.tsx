import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { router } from 'expo-router';

function CenterQrButton() {
  return (
    <View style={styles.centerQrSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="QR kod"
        onPress={() => router.push('/qr')}
        style={({ pressed }) => [styles.centerQrButton, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={styles.qrButtonInner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name="qrcode" size={24} color="#120724" />
        </View>
      </Pressable>
    </View>
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
          borderTopColor: '#E8E4F0',
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          height: isWeb ? 80 : 64,
          paddingTop: 6,
          paddingBottom: isWeb ? 12 : 4,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          lineHeight: 14,
          marginBottom: isWeb ? 8 : 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bosh sahifa',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Katalog',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-grid" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bonuses"
        options={{
          title: 'QR kod',
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => <CenterQrButton />,
        }}
      />
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
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerQrSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerQrButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    backgroundColor: '#FFCC00',
    borderWidth: 3,
    borderColor: '#fcfaff',
  },
  qrButtonInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFCC00',
  },
});
