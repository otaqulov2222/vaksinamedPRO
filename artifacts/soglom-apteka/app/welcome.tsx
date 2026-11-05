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
const TAGLINE_HEIGHT = 40;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const at = (delay: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(delay), anim]);

/**
 * Welcome gate — full-window brand reveal.
 * Assets stay untouched; wrappers only move / fade / scale.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useApp();
  const { height: winH } = useWindowDimensions();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  const symbolH = clamp(Math.round(winH * 0.18), 112, 156);
  const symbolW = Math.round(symbolH * SYMBOL_ASPECT);
  const wordW = Math.round(symbolH * 1.68);
  const wordH = Math.round(wordW / WORDMARK_ASPECT);
  const gapSymbol = Math.round(symbolH * 0.22);
  const groupH = symbolH + gapSymbol + wordH + 18 + TAGLINE_HEIGHT + 12;

  const topPad = Platform.OS === 'web' ? 18 : Math.max(insets.top, 12) + 6;
  const bottomPad = Math.max(insets.bottom, 18) + 28;
  const buttonsH = 54 * 2 + 16;
  const areaTop = topPad + 48 + 12;
  const areaBottom = winH - bottomPad - buttonsH - 28;
  // Brand sits in the upper-middle band — clearer hierarchy than dead-center.
  const groupTop = Math.max(areaTop, Math.round(areaTop + (areaBottom - areaTop) * 0.28 - groupH / 2));

  const v = useRef({
    curtain: new Animated.Value(1),
    scene: new Animated.Value(0),
    sceneScale: new Animated.Value(1.06),
    symbolOpacity: new Animated.Value(0),
    symbolScale: new Animated.Value(0.2),
    symbolY: new Animated.Value(72),
    wordOpacity: new Animated.Value(0),
    wordY: new Animated.Value(40),
    wordScale: new Animated.Value(0.92),
    rule: new Animated.Value(0),
    tagOpacity: new Animated.Value(0),
    tagY: new Animated.Value(22),
    topOpacity: new Animated.Value(0),
    topY: new Animated.Value(-16),
    sheetY: new Animated.Value(120),
    sheetOpacity: new Animated.Value(0),
    primaryOpacity: new Animated.Value(0),
    primaryY: new Animated.Value(28),
    secondaryOpacity: new Animated.Value(0),
    secondaryY: new Animated.Value(28),
  }).current;

  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [revealing, setRevealing] = useState(true);

  const settle = () => {
    running.current?.stop();
    running.current = null;
    v.curtain.setValue(0);
    v.scene.setValue(1);
    v.sceneScale.setValue(1);
    v.symbolOpacity.setValue(1);
    v.symbolScale.setValue(1);
    v.symbolY.setValue(0);
    v.wordOpacity.setValue(1);
    v.wordY.setValue(0);
    v.wordScale.setValue(1);
    v.rule.setValue(1);
    v.tagOpacity.setValue(1);
    v.tagY.setValue(0);
    v.topOpacity.setValue(1);
    v.topY.setValue(0);
    v.sheetY.setValue(0);
    v.sheetOpacity.setValue(1);
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
      const soft = Easing.bezier(0.16, 1, 0.3, 1);
      const snap = Easing.bezier(0.34, 1.3, 0.64, 1);

      // Curtain lifts → scene settles → logo springs in → wordmark → rule/tag → CTA sheet.
      const sequence = Animated.parallel([
        at(0, easeTo(v.curtain, 0, 780, soft)),
        at(120, both(
          easeTo(v.scene, 1, 700, out),
          easeTo(v.sceneScale, 1, 900, soft),
        )),
        at(380, both(
          easeTo(v.symbolOpacity, 1, 420, out),
          easeTo(v.symbolY, 0, 780, soft),
          Animated.sequence([
            easeTo(v.symbolScale, 1.08, 640, snap),
            easeTo(v.symbolScale, 1, 280, out),
          ]),
        )),
        at(820, both(
          easeTo(v.wordOpacity, 1, 480, out),
          easeTo(v.wordY, 0, 560, soft),
          easeTo(v.wordScale, 1, 560, soft),
        )),
        at(1080, easeTo(v.rule, 1, 420, soft)),
        at(1180, both(
          easeTo(v.tagOpacity, 1, 440, out),
          easeTo(v.tagY, 0, 500, soft),
        )),
        at(1260, both(
          easeTo(v.topOpacity, 1, 380, out),
          easeTo(v.topY, 0, 420, soft),
        )),
        at(1320, both(
          easeTo(v.sheetOpacity, 1, 480, out),
          easeTo(v.sheetY, 0, 640, soft),
        )),
        at(1420, both(
          easeTo(v.primaryOpacity, 1, 400, out),
          easeTo(v.primaryY, 0, 480, soft),
        )),
        at(1560, both(
          easeTo(v.secondaryOpacity, 1, 400, out),
          easeTo(v.secondaryY, 0, 480, soft),
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

  const ruleWidth = v.rule.interpolate({ inputRange: [0, 1], outputRange: [0, 56] });

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: v.scene,
            transform: [{ scale: v.sceneScale }],
          },
        ]}
      >
        <AuthBackdrop variant="hero" />
      </Animated.View>

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
              transform: [{ translateY: v.wordY }, { scale: v.wordScale }],
            }}
          >
            <Image
              source={BRAND_WORDMARK}
              style={{ width: wordW, height: wordH }}
              contentFit="contain"
              transition={0}
            />
          </Animated.View>

          <Animated.View style={[styles.ruleWrap, { opacity: v.rule }]}>
            <Animated.View style={[styles.rule, { width: ruleWidth }]} />
          </Animated.View>

          <Animated.View
            style={{
              opacity: v.tagOpacity,
              transform: [{ translateY: v.tagY }],
            }}
          >
            <Text style={styles.tagline} numberOfLines={2}>
              {t('auth.brandTagline')}
            </Text>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: bottomPad,
              opacity: v.sheetOpacity,
              transform: [{ translateY: v.sheetY }],
            },
          ]}
        >
          <View style={styles.actions}>
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
        </Animated.View>
      </View>

      {/* Brand-deep curtain — lifts off the whole window, not a logo disc. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.curtain,
          {
            opacity: v.curtain,
            transform: [
              {
                translateY: v.curtain.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-winH * 0.12, 0],
                }),
              },
            ],
          },
        ]}
      />

      {revealing ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={settle} accessible={false} importantForAccessibility="no" />
      ) : null}

      <LanguagePickerSheet visible={languageSheetOpen} onClose={() => setLanguageSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.deep, overflow: 'hidden' },
  curtain: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.deep,
    zIndex: 8,
  },
  frame: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', zIndex: 3 },
  topBar: { position: 'absolute', right: 20, zIndex: 4 },
  group: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  ruleWrap: {
    marginTop: 18,
    marginBottom: 14,
    height: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.yellow,
  },
  tagline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: TAGLINE_HEIGHT / 2,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: 'rgba(75,36,138,0.72)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(248,247,251,0.92)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(75,36,138,0.08)',
    ...Platform.select({
      web: { boxShadow: '0 -12px 40px rgba(53,23,101,0.08)' } as object,
      default: {
        shadowColor: '#351765',
        shadowOpacity: 0.1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -8 },
        elevation: 12,
      },
    }),
  },
  actions: { gap: 14 },
});
