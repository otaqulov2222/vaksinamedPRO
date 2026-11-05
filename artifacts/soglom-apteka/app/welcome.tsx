import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { LanguagePickerSheet } from '@/components/LanguagePickerSheet';
import { WelcomeLanguageControl } from '@/components/WelcomeLanguageControl';
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
const TAGLINE_HEIGHT = 38;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const at = (delay: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(delay), anim]);

/**
 * Welcome gate: full-screen brand entrance.
 * Logo assets are never redrawn/distorted — only opacity / position / scale of wrappers.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useApp();
  const { height: winH } = useWindowDimensions();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  const symbolH = clamp(Math.round(winH * 0.2), 120, 172);
  const symbolW = Math.round(symbolH * SYMBOL_ASPECT);
  const wordW = Math.round(symbolH * 1.72);
  const wordH = Math.round(wordW / WORDMARK_ASPECT);
  const gapSymbol = Math.round(symbolH * 0.18);
  const groupH = symbolH + gapSymbol + wordH + 14 + TAGLINE_HEIGHT;

  const topPad = Platform.OS === 'web' ? 18 : Math.max(insets.top, 12) + 6;
  const bottomPad = Math.max(insets.bottom, 18) + 20;
  const buttonsH = 54 * 2 + 14;
  const areaTop = topPad + 44 + 20;
  const areaBottom = winH - bottomPad - buttonsH - 20;
  const groupTop = Math.max(areaTop, Math.round((areaTop + areaBottom) / 2 - groupH / 2 - 12));

  const v = useRef({
    veil: new Animated.Value(1),
    backdrop: new Animated.Value(0),
    symbolOpacity: new Animated.Value(0),
    symbolScale: new Animated.Value(0.42),
    symbolY: new Animated.Value(56),
    wordOpacity: new Animated.Value(0),
    wordY: new Animated.Value(28),
    tagOpacity: new Animated.Value(0),
    tagY: new Animated.Value(18),
    topOpacity: new Animated.Value(0),
    topY: new Animated.Value(-12),
    primaryOpacity: new Animated.Value(0),
    primaryY: new Animated.Value(36),
    secondaryOpacity: new Animated.Value(0),
    secondaryY: new Animated.Value(36),
  }).current;

  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [revealing, setRevealing] = useState(true);

  const settle = () => {
    running.current?.stop();
    running.current = null;
    v.veil.setValue(0);
    v.backdrop.setValue(1);
    v.symbolOpacity.setValue(1);
    v.symbolScale.setValue(1);
    v.symbolY.setValue(0);
    v.wordOpacity.setValue(1);
    v.wordY.setValue(0);
    v.tagOpacity.setValue(1);
    v.tagY.setValue(0);
    v.topOpacity.setValue(1);
    v.topY.setValue(0);
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
      if (calm) {
        settle();
        return;
      }

      const both = (...a: Animated.CompositeAnimation[]) => Animated.parallel(a);
      const out = Easing.out(Easing.cubic);
      const inOut = Easing.inOut(Easing.cubic);
      const soft = Easing.bezier(0.22, 1, 0.36, 1);

      // 1) Scene opens  2) Logo rises into place  3) Wordmark  4) Slogan  5) Chrome + CTAs
      const sequence = Animated.parallel([
        easeTo(v.backdrop, 1, 520, out),
        at(180, easeTo(v.veil, 0, 640, soft)),
        at(260, both(
          easeTo(v.symbolOpacity, 1, 560, out),
          easeTo(v.symbolY, 0, 720, soft),
          Animated.sequence([
            easeTo(v.symbolScale, 1.04, 620, soft),
            easeTo(v.symbolScale, 1, 260, inOut),
          ]),
        )),
        at(780, both(
          easeTo(v.wordOpacity, 1, 480, out),
          easeTo(v.wordY, 0, 560, soft),
        )),
        at(1020, both(
          easeTo(v.tagOpacity, 1, 440, out),
          easeTo(v.tagY, 0, 500, soft),
        )),
        at(1180, both(
          easeTo(v.topOpacity, 1, 400, out),
          easeTo(v.topY, 0, 440, soft),
        )),
        at(1280, both(
          easeTo(v.primaryOpacity, 1, 420, out),
          easeTo(v.primaryY, 0, 500, soft),
        )),
        at(1420, both(
          easeTo(v.secondaryOpacity, 1, 420, out),
          easeTo(v.secondaryY, 0, 500, soft),
        )),
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
    // Fresh full entrance every time this gate mounts (logout / app open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.backdrop }]}>
        <AuthBackdrop variant="hero" />
      </Animated.View>

      {/* Opening veil — lifts off the scene; not a logo backdrop. */}
      <Animated.View pointerEvents="none" style={[styles.veil, { opacity: v.veil }]} />

      <View style={styles.frame}>
        <Animated.View
          style={[
            styles.topBar,
            { top: topPad, opacity: v.topOpacity, transform: [{ translateY: v.topY }] },
          ]}
        >
          <WelcomeLanguageControl
            language={language as Language}
            onPress={() => setLanguageSheetOpen(true)}
          />
        </Animated.View>

        <View style={[styles.group, { top: groupTop }]} testID="welcome-brand">
          <Animated.View
            accessible
            accessibilityRole="header"
            accessibilityLabel={t('common.appName')}
            style={{
              opacity: v.symbolOpacity,
              transform: [{ translateY: v.symbolY }, { scale: v.symbolScale }],
            }}
          >
            <Image
              source={BRAND_SYMBOL}
              style={{ width: symbolW, height: symbolH }}
              contentFit="contain"
              transition={0}
            />
          </Animated.View>

          <Animated.View
            style={{
              marginTop: gapSymbol,
              opacity: v.wordOpacity,
              transform: [{ translateY: v.wordY }],
            }}
          >
            <Image
              source={BRAND_WORDMARK}
              style={{ width: wordW, height: wordH }}
              contentFit="contain"
              transition={0}
            />
          </Animated.View>

          <Animated.View
            style={{
              marginTop: 14,
              opacity: v.tagOpacity,
              transform: [{ translateY: v.tagY }],
            }}
          >
            <Text style={styles.tagline} numberOfLines={2}>
              {t('auth.brandTagline')}
            </Text>
          </Animated.View>
        </View>

        <View style={[styles.actions, { bottom: bottomPad }]}>
          <Animated.View style={{ opacity: v.primaryOpacity, transform: [{ translateY: v.primaryY }] }}>
            <AuthButton
              variant="yellow"
              label={t('auth.registerAction')}
              accessibilityHint={t('auth.welcomeRegisterHint')}
              onPress={() => router.push('/register')}
              testID="welcome-register"
            />
          </Animated.View>
          <Animated.View style={{ opacity: v.secondaryOpacity, transform: [{ translateY: v.secondaryY }] }}>
            <AuthButton
              variant="outline"
              label={t('common.loginAction')}
              accessibilityHint={t('auth.welcomeLoginHint')}
              onPress={() => router.push('/login')}
              testID="welcome-login"
            />
          </Animated.View>
        </View>
      </View>

      {revealing ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={settle} accessible={false} importantForAccessibility="no" />
      ) : null}

      <LanguagePickerSheet visible={languageSheetOpen} onClose={() => setLanguageSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.soft, overflow: 'hidden' },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.soft,
    zIndex: 2,
  },
  frame: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', zIndex: 3 },
  topBar: { position: 'absolute', right: 20, zIndex: 4 },
  group: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  tagline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: TAGLINE_HEIGHT / 2,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: 'rgba(75,36,138,0.64)',
  },
  actions: { position: 'absolute', left: 24, right: 24, gap: 14 },
});
