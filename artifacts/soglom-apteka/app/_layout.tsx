import React, { useEffect, useState } from 'react';
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
try {
  SplashScreen.setOptions({ duration: 320, fade: true });
} catch {
  // Older native binaries without setOptions keep the default hide.
}

const LAUNCH_BG = '#F8F5FF';
/** Safety net: never keep the native splash up if the session check stalls. */
const SPLASH_FALLBACK_MS = 5000;

let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  void SplashScreen.hideAsync().catch(() => undefined);
}

/** Matches the native splash; the spinner only appears if the wait is noticeable. */
function LaunchCover({ overlay = false }: { overlay?: boolean }) {
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShowSpinner(true), 600);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={[overlay ? StyleSheet.absoluteFill : styles.fill, styles.cover]}>
      {showSpinner ? <ActivityIndicator color="#4B248A" size="small" /> : null}
    </View>
  );
}

// Enforce zero margin/padding reset on html, body, #root to guarantee 100% viewport coverage
function applyWebViewportLock() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const webApp = (window as any).Telegram?.WebApp;
  if (webApp) {
    webApp.ready?.();
    webApp.expand?.();
  }
  const styleEl = document.getElementById('vaksinamed-viewport-lock');
  if (!styleEl) {
    const style = document.createElement('style');
    style.id = 'vaksinamed-viewport-lock';
    style.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        overflow-x: hidden !important;
        background-color: #F7F5F2 !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      }
      #root {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        overflow-x: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      }
      #root > div {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      input, textarea, button, select {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      }
    `;
    document.head.appendChild(style);
  }
}
applyWebViewportLock();

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

const authScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: LAUNCH_BG },
};
const welcomeScreenOptions = { ...authScreenOptions, animation: 'fade' as const };

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useApp();
  const segments = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === 'welcome' || segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'verify-otp';
  // Language can be chosen before signing in (Welcome language pill); it holds no account data.
  const isPublic = segments[0] === 'language';

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && !inAuthGroup && !isPublic) {
      router.replace('/welcome');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [loading, isAuthenticated, inAuthGroup, isPublic]);

  // The navigator stays mounted so the redirect can run; protected content is covered until it does
  // (e.g. after logout or browser Back into a protected URL).
  const blocked = !isAuthenticated && !inAuthGroup && !isPublic;
  const settled = !loading && !blocked && !(isAuthenticated && inAuthGroup);

  useEffect(() => {
    if (settled) hideSplash();
  }, [settled]);

  if (loading) return <LaunchCover />;

  return (
    <>
      {children}
      {blocked ? <LaunchCover overlay /> : null}
    </>
  );
}

function RootLayoutNav() {
  const { t } = useApp();
  return (
    <AuthGate>
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="welcome" options={welcomeScreenOptions} />
        <Stack.Screen name="login" options={authScreenOptions} />
        <Stack.Screen name="register" options={authScreenOptions} />
        <Stack.Screen name="verify-otp" options={authScreenOptions} />
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
  applyWebViewportLock();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    const id = setTimeout(hideSplash, SPLASH_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);

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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { alignItems: 'center', justifyContent: 'center', backgroundColor: LAUNCH_BG },
});
