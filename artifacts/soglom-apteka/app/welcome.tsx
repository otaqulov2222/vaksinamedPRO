import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Welcome = kirish rasmi / kiriish rasmi full.png (1:1)
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: Platform.OS === 'web' ? 0 : Math.max(0, insets.top - 2) },
      ]}
    >
      <Animated.View style={[styles.frame, { opacity: fade }]}>
        <Image
          source={require('../assets/images/welcome-screen.png')}
          style={styles.screen}
          resizeMode="stretch"
          accessibilityLabel="Vaksina Med"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ro‘yxatdan o‘tish"
          onPress={() => router.push('/register')}
          style={({ pressed }) => [styles.hitRegister, pressed && styles.pressed]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kirish"
          onPress={() => router.push('/login')}
          style={({ pressed }) => [styles.hitLogin, pressed && styles.pressed]}
        />
      </Animated.View>
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
    maxWidth: 430,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: Platform.OS === 'web' ? 2 : 0,
    borderColor: '#5C328E',
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  hitRegister: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '76.3%',
    height: '5.8%',
    borderRadius: 28,
  },
  hitLogin: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '84.1%',
    height: '5.5%',
    borderRadius: 28,
  },
  pressed: {
    backgroundColor: 'rgba(42, 16, 78, 0.08)',
  },
});
