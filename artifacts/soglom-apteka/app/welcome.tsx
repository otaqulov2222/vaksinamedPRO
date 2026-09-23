import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PURPLE = '#5C328E';
const PURPLE_DEEP = '#2A104E';
const YELLOW = '#FFCC00';
const MAX_FRAME = 430;

/**
 * Auth entry.
 * Background: welcome-bg-clean.png (derived from welcome-screen.png with baked CTAs cropped out).
 * Exactly two RN CTAs — no UI controls inside the image.
 * Session redirect remains in AuthGate (_layout).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  const bottomPad = Math.max(insets.bottom, 16) + 12;
  const topPad = Platform.OS === 'web' ? 0 : Math.max(insets.top, 0);
  const compact = winH < 680;
  const btnMinH = compact ? 50 : 54;

  return (
    <View style={styles.root}>
      <View style={[styles.frame, { maxWidth: MAX_FRAME }]}>
        <Image
          source={require('../assets/images/welcome-bg-clean.png')}
          style={styles.bg}
          contentFit="cover"
          contentPosition="top center"
          transition={0}
          accessibilityIgnoresInvertColors
          accessibilityLabel="Vaksina Med"
        />

        <View
          style={[
            styles.content,
            { paddingTop: topPad, paddingBottom: bottomPad },
          ]}
        >
          <View style={styles.flexGrow} />

          <Animated.View
            style={[
              styles.actions,
              { opacity: fade, transform: [{ translateY: rise }] },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ro‘yxatdan o‘tish"
              accessibilityHint="Ro‘yxatdan o‘tish sahifasiga o‘tadi"
              onPress={() => router.push('/register')}
              style={({ pressed }) => [
                styles.btnPrimary,
                { minHeight: btnMinH },
                pressed && styles.btnPrimaryPressed,
              ]}
            >
              <Text style={styles.btnPrimaryText}>Ro‘yxatdan o‘tish</Text>
              <Feather name="arrow-right" size={18} color={PURPLE_DEEP} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kirish"
              accessibilityHint="Kirish sahifasiga o‘tadi"
              onPress={() => router.push('/login')}
              style={({ pressed }) => [
                styles.btnSecondary,
                { minHeight: btnMinH },
                pressed && styles.btnSecondaryPressed,
              ]}
            >
              <Text style={styles.btnSecondaryText}>Kirish</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { alignItems: 'center' as const } : null),
  },
  frame: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F7F5FC',
    ...(Platform.OS === 'web'
      ? { borderWidth: 2, borderColor: PURPLE, borderRadius: 0 }
      : null),
  },
  bg: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'flex-end',
  },
  flexGrow: {
    flex: 1,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: YELLOW,
    borderRadius: 999,
    paddingHorizontal: 20,
    minHeight: 54,
    ...Platform.select({
      ios: {
        shadowColor: '#C9A000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  btnPrimaryPressed: {
    opacity: 0.88,
  },
  btnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    letterSpacing: 0.2,
  },
  btnSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: PURPLE,
    paddingHorizontal: 20,
    minHeight: 54,
  },
  btnSecondaryPressed: {
    backgroundColor: 'rgba(92,50,142,0.08)',
  },
  btnSecondaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    letterSpacing: 0.2,
  },
});
