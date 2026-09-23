import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider, useApp } from '@/context/AppContext';
import { ActivityIndicator, Platform, View } from 'react-native';
import { HeaderBackButton } from '@/components/HeaderBackButton';

SplashScreen.preventAutoHideAsync();

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const webApp = (window as any).Telegram?.WebApp;
  if (webApp) {
    webApp.ready?.();
    webApp.expand?.();
  }
}

const queryClient = new QueryClient();

const stackScreenOptions = {
  headerBackTitle: 'Orqaga',
  headerBackVisible: true,
  headerTintColor: '#5C328E',
  headerTitleAlign: 'center' as const,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: '#FFFFFF' },
  headerTitleStyle: { fontFamily: 'Inter_700Bold', color: '#2A104E', fontSize: 17 },
  contentStyle: { backgroundColor: '#F7F5F2' },
  headerLeft: () => <HeaderBackButton />,
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useApp();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'welcome' || segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'verify-otp';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/welcome');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [loading, isAuthenticated, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A104E' }}>
        <ActivityIndicator color="#FFCC00" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGate>
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, headerLeft: undefined }} />
        <Stack.Screen name="qr" options={{ headerShown: false, title: 'Mening QR kodim' }} />
        {/* Cashback is a stack child (not a tab) so Back preserves Profile/Help/Home origin. */}
        <Stack.Screen name="cashback" options={{ headerShown: false, title: 'Cashback' }} />
        <Stack.Screen
          name="branches"
          options={{ title: 'Dorixonalar', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="promos"
          options={{ title: 'Aksiyalar', headerLeft: () => <HeaderBackButton fallback="/(tabs)" /> }}
        />
        <Stack.Screen
          name="rating"
          options={{ title: 'Xizmatni baholash', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="language"
          options={{ title: 'Til', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ title: 'Profilni tahrirlash', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="notifications"
          options={{ title: 'Bildirishnomalar', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="help"
          options={{ title: 'Yordam markazi', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="about"
          options={{ title: 'Ilova haqida', headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen name="cart" options={{ headerShown: false, title: 'Savat' }} />
        <Stack.Screen name="checkout" options={{ headerShown: false, title: 'Rasmiylashtirish' }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false, title: 'Mahsulot' }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false, title: 'Buyurtma holati' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Sahifa topilmadi' }} />
      </Stack>
    </AuthGate>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <GestureHandlerRootView style={{ flex: 1, minWidth: 0, width: '100%' }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
