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
 * Welcome gate — A+2: soft minimal surface, staggered fade/slide (no curtain, sheet, bounce, or logo halo).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useApp();
  const { height: winH } = useWindowDimensions();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  const symbolH = clamp(Math.round(winH * 0.19), 118, 160);
  const symbolW = Math.round(symbolH * SYMBOL_ASPECT);
  const wordW = Math.round(symbolH * 1.7);
  const wordH = Math.round(wordW / WORDMARK_ASPECT);
  const gapSymbol = Math.round(symbolH * 0.2);
  const groupH = symbolH + gapSymbol + wordH + 16 + TAGLINE_HEIGHT;

  const topPad = Platform.OS === 'web' ? 18 : Math.max(insets.top, 12) + 6;
  const bottomPad = Math.max(insets.bottom, 18) + 22;
  const buttonsH = 54 * 2 + 14;
  const areaTop = topPad + 44 + 16;
  const areaBottom = winH - bottomPad - buttonsH - 24;
  const groupTop = Math.max(areaTop, Math.round((areaTop + areaBottom) / 2 - groupH / 2 - 8));

  const v = useRef({
    scene: new Animated.Value(0),
    symbolOpacity: new Animated.Value(0),
    symbolY: new Animated.Value(18),
    wordOpacity: new Animated.Value(0),
    wordY: new Animated.Value(14),
    tagOpacity: new Animated.Value(0),
    tagY: new Animated.Value(12),
    topOpacity: new Animated.Value(0),
    primaryOpacity: new Animated.Value(0),
    primaryY: new Animated.Value(16),
    secondaryOpacity: new Animated.Value(0),
    secondaryY: new Animated.Value(16),
  }).current;

  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [revealing, setRevealing] = useState(true);

  const settle = () => {
    running.current?.stop();
    running.current = null;
    v.scene.setValue(1);
    v.symbolOpacity.setValue(1);
    v.symbolY.setValue(0);
    v.wordOpacity.setValue(1);
    v.wordY.setValue(0);
    v.tagOpacity.setValue(1);
    v.tagY.setValue(0);
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
      if (calm) {
        settle();
        return;
      }

      const both = (...a: Animated.CompositeAnimation[]) => Animated.parallel(a);
      const out = Easing.out(Easing.cubic);

      // Scene → logo → wordmark/tagline → chrome + CTAs. No scale bounce.
      const sequence = Animated.parallel([
        easeTo(v.scene, 1, 520, out),
        at(220, both(
          easeTo(v.symbolOpacity, 1, 480, out),
          easeTo(v.symbolY, 0, 520, out),
        )),
        at(480, both(
          easeTo(v.wordOpacity, 1, 440, out),
          easeTo(v.wordY, 0, 480, out),
        )),
        at(640, both(
          easeTo(v.tagOpacity, 1, 420, out),
          easeTo(v.tagY, 0, 460, out),
        )),
        at(720, easeTo(v.topOpacity, 1, 360, out)),
        at(780, both(
          easeTo(v.primaryOpacity, 1, 420, out),
          easeTo(v.primaryY, 0, 460, out),
        )),
        at(920, both(
          easeTo(v.secondaryOpacity, 1, 420, out),
          easeTo(v.secondaryY, 0, 460, out),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.scene }]}>
        <AuthBackdrop variant="quiet" />
      </Animated.View>

      <View style={styles.frame}>
        <Animated.View style={[styles.topBar, { top: topPad, opacity: v.topOpacity }]}>
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
              transform: [{ translateY: v.symbolY }],
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
              marginTop: 16,
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
