import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { LanguageBadge } from '@/components/LanguageBadge';
import {
  AUTH_COLORS as C,
  AuthBackdrop,
  AuthButton,
  BRAND_SYMBOL,
  BRAND_WORDMARK,
  SYMBOL_ASPECT,
  WORDMARK_ASPECT,
  easeTo,
  prefersCalmMotion,
} from '@/components/AuthUI';
import type { Language } from '@/lib/languages';

const MAX_WIDTH = 440;
const TAGLINE_HEIGHT = 32;

/** The full brand reveal plays once per app session; later visits use the short entry. */
let revealedThisSession = false;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const at = (delay: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(delay), anim]);

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useApp();
  const { height: winH } = useWindowDimensions();

  const cold = useRef(!revealedThisSession).current;
  // The native splash already shows the symbol centred on the same background, so the reveal continues from it.
  const fromNativeSplash = cold && Platform.OS !== 'web';

  const symbolH = clamp(Math.round(winH * 0.19), 112, 164);
  const symbolW = Math.round(symbolH * SYMBOL_ASPECT);
  const wordW = Math.round(symbolH * 1.65);
  const wordH = Math.round(wordW / WORDMARK_ASPECT);
  const gapSymbol = Math.round(symbolH * 0.15);
  const groupH = symbolH + gapSymbol + wordH + 12 + TAGLINE_HEIGHT;

  const topPad = Platform.OS === 'web' ? 16 : Math.max(insets.top, 12) + 4;
  const bottomPad = Math.max(insets.bottom, 16) + 16;
  const buttonsH = 54 * 2 + 12;
  const areaTop = topPad + 40 + 16;
  const areaBottom = winH - bottomPad - buttonsH - 16;
  const groupTop = Math.max(areaTop, Math.round((areaTop + areaBottom) / 2 - groupH / 2 - 8));
  const centreOffset = Math.round(winH / 2 - (groupTop + symbolH / 2));

  const v = useRef({
    backdrop: new Animated.Value(cold ? 0 : 1),
    symbolOpacity: new Animated.Value(fromNativeSplash ? 1 : 0),
    symbolScale: new Animated.Value(cold && !fromNativeSplash ? 0.92 : 1),
    wordOpacity: new Animated.Value(0),
    wordY: new Animated.Value(cold ? 8 : 0),
    tagOpacity: new Animated.Value(0),
    tagY: new Animated.Value(cold ? 6 : 8),
    groupY: new Animated.Value(cold ? centreOffset : -8),
    topOpacity: new Animated.Value(0),
    primaryOpacity: new Animated.Value(0),
    primaryY: new Animated.Value(12),
    secondaryOpacity: new Animated.Value(0),
    secondaryY: new Animated.Value(12),
  }).current;

  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [revealing, setRevealing] = useState(cold);

  const settle = () => {
    running.current?.stop();
    running.current = null;
    v.backdrop.setValue(1);
    v.symbolOpacity.setValue(1);
    v.symbolScale.setValue(1);
    v.wordOpacity.setValue(1);
    v.wordY.setValue(0);
    v.tagOpacity.setValue(1);
    v.tagY.setValue(0);
    v.groupY.setValue(0);
    v.topOpacity.setValue(1);
    v.primaryOpacity.setValue(1);
    v.primaryY.setValue(0);
    v.secondaryOpacity.setValue(1);
    v.secondaryY.setValue(0);
    setRevealing(false);
  };

  useEffect(() => {
    let alive = true;
    void prefersCalmMotion().then((calm) => {
      if (!alive) return;
      revealedThisSession = true;
      if (calm) {
        settle();
        return;
      }
      const both = (...a: Animated.CompositeAnimation[]) => Animated.parallel(a);
      const sequence = cold
        ? Animated.parallel([
            easeTo(v.backdrop, 1, 360),
            at(60, both(easeTo(v.symbolOpacity, 1, 420), easeTo(v.symbolScale, 1, 440))),
            at(380, both(easeTo(v.wordOpacity, 1, 360), easeTo(v.wordY, 0, 380))),
            at(600, both(easeTo(v.tagOpacity, 1, 340), easeTo(v.tagY, 0, 360))),
            at(1000, easeTo(v.groupY, 0, 460, Easing.inOut(Easing.cubic))),
            at(1120, easeTo(v.topOpacity, 1, 320)),
            at(1160, both(easeTo(v.primaryOpacity, 1, 320), easeTo(v.primaryY, 0, 360))),
            at(1230, both(easeTo(v.secondaryOpacity, 1, 320), easeTo(v.secondaryY, 0, 360))),
          ])
        : Animated.parallel([
            both(easeTo(v.symbolOpacity, 1, 280), easeTo(v.wordOpacity, 1, 280), easeTo(v.groupY, 0, 300), easeTo(v.topOpacity, 1, 280)),
            at(50, both(easeTo(v.tagOpacity, 1, 280), easeTo(v.tagY, 0, 300))),
            at(100, both(easeTo(v.primaryOpacity, 1, 280), easeTo(v.primaryY, 0, 300))),
            at(150, both(easeTo(v.secondaryOpacity, 1, 280), easeTo(v.secondaryY, 0, 300))),
          ]);
      running.current = sequence;
      sequence.start(({ finished }) => {
        if (finished && alive) {
          running.current = null;
          setRevealing(false);
        }
      });
    });
    return () => {
      alive = false;
      running.current?.stop();
    };
    // Runs once per mount; geometry changes after the reveal only move the resting layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goRegister = () => router.push('/register');
  const goLogin = () => router.push('/login');

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.backdrop }]}>
        <AuthBackdrop variant="hero" />
      </Animated.View>

      <View style={styles.frame}>
        <Animated.View style={[styles.topBar, { top: topPad, opacity: v.topOpacity }]}>
          <LanguageBadge language={language as Language} onPress={() => router.push('/language')} />
        </Animated.View>

        <Animated.View
          style={[styles.group, { top: groupTop, transform: [{ translateY: v.groupY }] }]}
          accessible
          accessibilityRole="header"
          accessibilityLabel={t('common.appName')}
          testID="welcome-brand"
        >
          <Animated.View style={{ opacity: v.symbolOpacity, transform: [{ scale: v.symbolScale }] }}>
            <Image source={BRAND_SYMBOL} style={{ width: symbolW, height: symbolH }} contentFit="contain" transition={0} />
          </Animated.View>
          <Animated.View style={{ marginTop: gapSymbol, opacity: v.wordOpacity, transform: [{ translateY: v.wordY }] }}>
            <Image source={BRAND_WORDMARK} style={{ width: wordW, height: wordH }} contentFit="contain" transition={0} />
          </Animated.View>
          <Animated.View style={{ marginTop: 12, opacity: v.tagOpacity, transform: [{ translateY: v.tagY }] }}>
            <Text style={styles.tagline} numberOfLines={2}>
              {t('auth.brandTagline')}
            </Text>
          </Animated.View>
        </Animated.View>

        <View style={[styles.actions, { bottom: bottomPad }]}>
          <Animated.View style={{ opacity: v.primaryOpacity, transform: [{ translateY: v.primaryY }] }}>
            <AuthButton
              variant="yellow"
              label={t('auth.registerAction')}
              accessibilityHint={t('auth.welcomeRegisterHint')}
              onPress={goRegister}
              testID="welcome-register"
            />
          </Animated.View>
          <Animated.View style={{ opacity: v.secondaryOpacity, transform: [{ translateY: v.secondaryY }] }}>
            <AuthButton
              variant="outline"
              label={t('common.loginAction')}
              accessibilityHint={t('auth.welcomeLoginHint')}
              onPress={goLogin}
              testID="welcome-login"
            />
          </Animated.View>
        </View>
      </View>

      {revealing ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={settle} accessible={false} importantForAccessibility="no" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.soft, overflow: 'hidden' },
  frame: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  topBar: { position: 'absolute', right: 24 },
  group: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  tagline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    lineHeight: TAGLINE_HEIGHT / 2,
    letterSpacing: 2,
    textAlign: 'center',
    color: 'rgba(75,36,138,0.62)',
  },
  actions: { position: 'absolute', left: 24, right: 24, gap: 12 },
});
