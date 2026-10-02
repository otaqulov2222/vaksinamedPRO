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
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
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

  const inAuthGroup = segments[0] === 'welcome' || segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'verify-otp';

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/welcome');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [loading, isAuthenticated, inAuthGroup]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A104E' }}>
        <ActivityIndicator color="#FFCC00" size="large" />
      </View>
    );
  }

  // The navigator stays mounted so the redirect can run; protected content is covered until it does
  // (e.g. after logout or browser Back into a protected URL).
  const blocked = !isAuthenticated && !inAuthGroup;
  return (
    <>
      {children}
      {blocked ? (
        <View
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A104E' }]}
        >
          <ActivityIndicator color="#FFCC00" size="large" />
        </View>
      ) : null}
    </>
  );
}

function RootLayoutNav() {
  const { t } = useApp();
  return (
    <AuthGate>
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, headerLeft: undefined }} />
        <Stack.Screen name="qr" options={{ headerShown: false, title: t('common.navMyQr') }} />
        {/* Cashback is a stack child (not a tab) so Back preserves Profile/Help/Home origin. */}
        <Stack.Screen name="cashback" options={{ headerShown: false, title: t('common.navCashback') }} />
        <Stack.Screen
          name="branches"
          options={{ title: t('common.navBranches'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="promos"
          options={{ title: t('common.navPromos'), headerLeft: () => <HeaderBackButton fallback="/(tabs)" /> }}
        />
        <Stack.Screen
          name="rating"
          options={{ title: t('common.navRating'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="language"
          options={{ title: t('common.navLanguage'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ title: t('common.navEditProfile'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="notifications"
          options={{ title: t('common.navNotifications'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="help"
          options={{ title: t('common.navHelp'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen
          name="about"
          options={{ title: t('common.navAbout'), headerLeft: () => <HeaderBackButton fallback="/(tabs)/profile" /> }}
        />
        <Stack.Screen name="cart" options={{ headerShown: false, title: t('common.navCart') }} />
        <Stack.Screen name="checkout" options={{ headerShown: false, title: t('common.navCheckout') }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false, title: t('common.navProduct') }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false, title: t('common.navOrderStatus') }} />
        <Stack.Screen name="+not-found" options={{ title: t('common.navNotFound') }} />
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
