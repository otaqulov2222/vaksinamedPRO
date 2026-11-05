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
const TAGLINE_HEIGHT = 36;

/** The full brand reveal plays once per app session; later visits use the short entry. */
let revealedThisSession = false;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const at = (delay: number, anim: Animated.CompositeAnimation) => Animated.sequence([Animated.delay(delay), anim]);

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useApp();
  const { height: winH } = useWindowDimensions();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  const cold = useRef(!revealedThisSession).current;
  // The native splash already shows the symbol centred on the same background, so the reveal continues from it.
  const fromNativeSplash = cold && Platform.OS !== 'web';

  const symbolH = clamp(Math.round(winH * 0.19), 112, 164);
  const symbolW = Math.round(symbolH * SYMBOL_ASPECT);
  const wordW = Math.round(symbolH * 1.65);
  const wordH = Math.round(wordW / WORDMARK_ASPECT);
  const gapSymbol = Math.round(symbolH * 0.15);
  const groupH = symbolH + gapSymbol + wordH + 12 + TAGLINE_HEIGHT;
  const glowSize = Math.round(symbolH * 1.55);

  const topPad = Platform.OS === 'web' ? 16 : Math.max(insets.top, 12) + 4;
  const bottomPad = Math.max(insets.bottom, 16) + 16;
  const buttonsH = 54 * 2 + 12;
  const areaTop = topPad + 40 + 16;
  const areaBottom = winH - bottomPad - buttonsH - 16;
  const groupTop = Math.max(areaTop, Math.round((areaTop + areaBottom) / 2 - groupH / 2 - 8));
  const centreOffset = Math.round(winH / 2 - (groupTop + symbolH / 2));

  const v = useRef({
    backdrop: new Animated.Value(cold ? 0 : 1),
    glowOpacity: new Animated.Value(cold && !fromNativeSplash ? 0 : 0.35),
    glowScale: new Animated.Value(cold && !fromNativeSplash ? 0.55 : 1),
    ringOpacity: new Animated.Value(0),
    ringScale: new Animated.Value(0.7),
    symbolOpacity: new Animated.Value(fromNativeSplash ? 1 : 0),
    symbolScale: new Animated.Value(cold && !fromNativeSplash ? 0.72 : 1),
    wordOpacity: new Animated.Value(0),
    wordY: new Animated.Value(cold ? 14 : 0),
    wordScale: new Animated.Value(cold ? 0.98 : 1),
    tagOpacity: new Animated.Value(0),
    tagY: new Animated.Value(cold ? 10 : 0),
    groupY: new Animated.Value(cold ? centreOffset : -8),
    topOpacity: new Animated.Value(0),
    topY: new Animated.Value(cold ? -6 : 0),
    primaryOpacity: new Animated.Value(0),
    primaryY: new Animated.Value(18),
    secondaryOpacity: new Animated.Value(0),
    secondaryY: new Animated.Value(18),
  }).current;

  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [revealing, setRevealing] = useState(cold);

  const settle = () => {
    running.current?.stop();
    running.current = null;
    v.backdrop.setValue(1);
    v.glowOpacity.setValue(0.28);
    v.glowScale.setValue(1);
    v.ringOpacity.setValue(0);
    v.ringScale.setValue(1.2);
    v.symbolOpacity.setValue(1);
    v.symbolScale.setValue(1);
    v.wordOpacity.setValue(1);
    v.wordY.setValue(0);
    v.wordScale.setValue(1);
    v.tagOpacity.setValue(1);
    v.tagY.setValue(0);
    v.groupY.setValue(0);
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
      revealedThisSession = true;
      if (calm) {
        settle();
        return;
      }
      const both = (...a: Animated.CompositeAnimation[]) => Animated.parallel(a);
      const outCubic = Easing.out(Easing.cubic);
      const inOutCubic = Easing.inOut(Easing.cubic);

      /** Logo pop: grow past 1 then settle — asset itself never changes. */
      const symbolReveal = Animated.sequence([
        both(
          easeTo(v.symbolOpacity, 1, 420, outCubic),
          easeTo(v.symbolScale, 1.07, 520, outCubic),
        ),
        easeTo(v.symbolScale, 1, 320, inOutCubic),
      ]);

      const glowReveal = both(
        easeTo(v.glowOpacity, 0.42, 480, outCubic),
        easeTo(v.glowScale, 1, 640, outCubic),
      );

      const ringPulse = Animated.sequence([
        both(
          easeTo(v.ringOpacity, 0.45, 280, outCubic),
          easeTo(v.ringScale, 1.08, 520, outCubic),
        ),
        both(
          easeTo(v.ringOpacity, 0, 420, outCubic),
          easeTo(v.ringScale, 1.28, 420, outCubic),
        ),
      ]);

      const sequence = cold
        ? Animated.parallel([
            easeTo(v.backdrop, 1, 420, outCubic),
            at(40, glowReveal),
            at(90, symbolReveal),
            at(280, ringPulse),
            at(520, both(
              easeTo(v.wordOpacity, 1, 400, outCubic),
              easeTo(v.wordY, 0, 440, outCubic),
              easeTo(v.wordScale, 1, 440, outCubic),
            )),
            at(760, both(easeTo(v.tagOpacity, 1, 380, outCubic), easeTo(v.tagY, 0, 400, outCubic))),
            at(980, easeTo(v.groupY, 0, 520, inOutCubic)),
            at(1080, both(easeTo(v.topOpacity, 1, 340, outCubic), easeTo(v.topY, 0, 360, outCubic))),
            at(1140, both(easeTo(v.primaryOpacity, 1, 360, outCubic), easeTo(v.primaryY, 0, 400, outCubic))),
            at(1260, both(easeTo(v.secondaryOpacity, 1, 360, outCubic), easeTo(v.secondaryY, 0, 400, outCubic))),
            // Soft resting glow after the punch
            at(1400, easeTo(v.glowOpacity, 0.28, 500, outCubic)),
          ])
        : Animated.parallel([
            both(
              easeTo(v.symbolOpacity, 1, 300, outCubic),
              easeTo(v.wordOpacity, 1, 300, outCubic),
              easeTo(v.groupY, 0, 320, outCubic),
              easeTo(v.topOpacity, 1, 300, outCubic),
              easeTo(v.glowOpacity, 0.28, 300, outCubic),
            ),
            at(40, both(easeTo(v.tagOpacity, 1, 280, outCubic), easeTo(v.tagY, 0, 300, outCubic))),
            at(90, both(easeTo(v.primaryOpacity, 1, 280, outCubic), easeTo(v.primaryY, 0, 300, outCubic))),
            at(140, both(easeTo(v.secondaryOpacity, 1, 280, outCubic), easeTo(v.secondaryY, 0, 300, outCubic))),
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

        <Animated.View
          style={[styles.group, { top: groupTop, transform: [{ translateY: v.groupY }] }]}
          accessible
          accessibilityRole="header"
          accessibilityLabel={t('common.appName')}
          testID="welcome-brand"
        >
          {/* Atmosphere only — brand PNGs stay untouched. */}
          <View style={[styles.symbolStage, { width: glowSize, height: glowSize }]}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glow,
                {
                  width: glowSize,
                  height: glowSize,
                  borderRadius: glowSize / 2,
                  opacity: v.glowOpacity,
                  transform: [{ scale: v.glowScale }],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: glowSize * 0.92,
                  height: glowSize * 0.92,
                  borderRadius: (glowSize * 0.92) / 2,
                  opacity: v.ringOpacity,
                  transform: [{ scale: v.ringScale }],
                },
              ]}
            />
            <Animated.View
              style={{
                opacity: v.symbolOpacity,
                transform: [{ scale: v.symbolScale }],
              }}
            >
              <Image
                source={BRAND_SYMBOL}
                style={{ width: symbolW, height: symbolH }}
                contentFit="contain"
                transition={0}
              />
            </Animated.View>
          </View>

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

      <LanguagePickerSheet visible={languageSheetOpen} onClose={() => setLanguageSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.soft, overflow: 'hidden' },
  frame: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  topBar: { position: 'absolute', right: 20 },
  group: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  symbolStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(75,36,138,0.16)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(75,36,138,0.28)',
    backgroundColor: 'transparent',
  },
  tagline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    lineHeight: TAGLINE_HEIGHT / 2,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: 'rgba(75,36,138,0.62)',
  },
  actions: { position: 'absolute', left: 24, right: 24, gap: 12 },
});
