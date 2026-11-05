import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

export const AUTH_COLORS = {
  primary: '#4B248A',
  deep: '#351765',
  light: '#F1EBFF',
  soft: '#F8F5FF',
  yellow: '#FFD233',
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  ink: '#17162C',
  secondary: '#6B7280',
  danger: '#DC2626',
} as const;

const C = AUTH_COLORS;
const FIELD_EDGE = '#E5E0EE';
const MUTED_TEXT = 'rgba(107,114,128,0.7)';
const useNativeDriver = Platform.OS !== 'web';

/** Crops of the production logo (assets/images/vaksina-med-logo.png); width / height. */
export const BRAND_SYMBOL = require('../assets/images/brand-symbol.png');
export const BRAND_WORDMARK = require('../assets/images/brand-wordmark.png');
export const SYMBOL_ASPECT = 572 / 566;
export const WORDMARK_ASPECT = 1320 / 153;

export function easeTo(value: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic)) {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver });
}

/** Resolves once: true when the OS asks for reduced motion or a screen reader is running. */
export function prefersCalmMotion(): Promise<boolean> {
  return Promise.all([
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
    // react-native-web always reports a screen reader, so on web only the reduced-motion media query counts.
    Platform.OS === 'web' ? false : AccessibilityInfo.isScreenReaderEnabled().catch(() => false),
  ]).then(([reduce, reader]) => reduce || reader);
}

/** One-shot fade + rise for form screens; instant when motion should be calm. */
export function useEntryAnimation(distance = 10) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void prefersCalmMotion().then((calm) => {
      if (!alive) return;
      if (calm) progress.setValue(1);
      else easeTo(progress, 1, 300).start();
    });
    return () => {
      alive = false;
      progress.stopAnimation();
    };
  }, [progress]);
  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  };
}

/*
 * Backdrop: 390×844, slice-scaled. Brand lockup ~y 180–480 stays clear — no soft disc
 * behind the logo, no yellow blur “spots” (those read as defects).
 * Hero: layered planes + precision orbits + one sharp brand-yellow stroke.
 * Quiet: same language, lower intensity for forms.
 */
const BACKDROP_BASE = '#F6F3FB';
const BACKDROP_MID = '#EBE4F6';
const BACKDROP_DEPTH = '#DDD3EF';
const LAVENDER = '#B9A3E3';
const LAVENDER_DEEP = '#8B6BC4';

const round1 = (n: number) => Math.round(n * 10) / 10;
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${round1(cx + r * Math.cos(a))} ${round1(cy + r * Math.sin(a))}`;
};
const arcPath = (cx: number, cy: number, r: number, from: number, to: number) =>
  `M${polar(cx, cy, r, from)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${polar(cx, cy, r, to)}`;
const bandPath = (cx: number, cy: number, inner: number, outer: number, from: number, to: number) =>
  `${arcPath(cx, cy, outer, from, to)} L${polar(cx, cy, inner, to)} A${inner} ${inner} 0 ${to - from > 180 ? 1 : 0} 0 ${polar(cx, cy, inner, from)} Z`;
const shieldPath = (cx: number, top: number, hw: number, h: number) =>
  `M${cx} ${top} C${cx + hw * 0.32} ${top + h * 0.08} ${cx + hw * 0.72} ${top + h * 0.12} ${cx + hw} ${top + h * 0.13} ` +
  `C${cx + hw} ${top + h * 0.52} ${cx + hw * 0.66} ${top + h * 0.83} ${cx} ${top + h} ` +
  `C${cx - hw * 0.66} ${top + h * 0.83} ${cx - hw} ${top + h * 0.52} ${cx - hw} ${top + h * 0.13} ` +
  `C${cx - hw * 0.72} ${top + h * 0.12} ${cx - hw * 0.32} ${top + h * 0.08} ${cx} ${top} Z`;
const crossPath = (cx: number, cy: number, arm: number, half: number) =>
  `M${cx - half} ${cy - arm} H${cx + half} V${cy - half} H${cx + arm} V${cy + half} H${cx + half} V${cy + arm} ` +
  `H${cx - half} V${cy + half} H${cx - arm} V${cy - half} H${cx - half} Z`;

const TL = { x: -70, y: -80 };
const TOP_RING = [
  arcPath(TL.x, TL.y, 260, 8, 82),
  arcPath(TL.x, TL.y, 300, 14, 55),
  arcPath(TL.x, TL.y, 300, 62, 95),
  arcPath(TL.x, TL.y, 340, 22, 78),
];
const BL = { x: -20, y: 900 };
const BAND_INNER = 200;
const BAND_OUTER = 380;
const LOW_BAND = bandPath(BL.x, BL.y, BAND_INNER, BAND_OUTER, -112, 22);
const LOW_BAND_EDGE = arcPath(BL.x, BL.y, BAND_OUTER, -112, 22);
const LOW_RING = [
  arcPath(BL.x, BL.y, 420, -112, -55),
  arcPath(BL.x, BL.y, 420, -48, 22),
  arcPath(BL.x, BL.y, 455, -100, -68),
  arcPath(BL.x, BL.y, 455, -58, 16),
];
/** Sharp brand accent on the orbit — a stroke, never a soft yellow blob. */
const YELLOW_ACCENT = arcPath(BL.x, BL.y, 420, -78, -68);
const TR = { x: 430, y: 20 };
const TOP_RIGHT_RING = [
  arcPath(TR.x, TR.y, 150, 115, 205),
  arcPath(TR.x, TR.y, 185, 105, 170),
  arcPath(TR.x, TR.y, 185, 180, 225),
];
const SHIELD = shieldPath(340, 530, 88, 210);
const SHIELD_INNER = shieldPath(340, 552, 68, 166);
const SHIELD_CROSS = crossPath(340, 620, 20, 6);
/** Diagonal glass plane behind CTAs (hero). */
const GLASS_PLANE = 'M-40 620 L260 480 L320 520 L20 700 Z';
const GLASS_PLANE_EDGE = 'M-40 620 L260 480';

/**
 * Brand environment for auth surfaces.
 */
export function AuthBackdrop({ variant = 'hero' }: { variant?: 'hero' | 'quiet' }) {
  const hero = variant === 'hero';
  const k = hero ? 1 : 0.42;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`base-${variant}`} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={hero ? '#E8E0F6' : BACKDROP_BASE} />
            <Stop offset="0.4" stopColor={BACKDROP_BASE} />
            <Stop offset="1" stopColor={hero ? BACKDROP_DEPTH : BACKDROP_MID} />
          </LinearGradient>
          <LinearGradient id={`wash-${variant}`} x1="1" y1="0" x2="0" y2="0.9">
            <Stop offset="0" stopColor={C.primary} stopOpacity={hero ? 0.14 : 0.05} />
            <Stop offset="0.5" stopColor={LAVENDER} stopOpacity={0} />
            <Stop offset="1" stopColor={C.deep} stopOpacity={hero ? 0.06 : 0.02} />
          </LinearGradient>
          <RadialGradient id={`field-${variant}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.3" stopColor={LAVENDER_DEEP} stopOpacity={0.26 * k} />
            <Stop offset="0.75" stopColor={LAVENDER} stopOpacity={0.22 * k} />
            <Stop offset="1" stopColor={LAVENDER} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`corner-${variant}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.15" stopColor={C.primary} stopOpacity={0.2 * k} />
            <Stop offset="0.7" stopColor={LAVENDER} stopOpacity={0.12 * k} />
            <Stop offset="1" stopColor={LAVENDER} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id={`band-${variant}`}
            cx={BL.x}
            cy={BL.y}
            r={BAND_OUTER}
            fx={BL.x}
            fy={BL.y}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={BAND_INNER / BAND_OUTER} stopColor={LAVENDER} stopOpacity={0} />
            <Stop offset="0.9" stopColor={LAVENDER} stopOpacity={0.38 * k} />
            <Stop offset="1" stopColor={C.primary} stopOpacity={0.2 * k} />
          </RadialGradient>
          <RadialGradient id={`depth-${variant}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.35" stopColor={LAVENDER_DEEP} stopOpacity={0.14 * k} />
            <Stop offset="0.85" stopColor={LAVENDER} stopOpacity={0.08 * k} />
            <Stop offset="1" stopColor={LAVENDER} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`plane-${variant}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.surface} stopOpacity={0.55} />
            <Stop offset="1" stopColor={LAVENDER} stopOpacity={0.18} />
          </LinearGradient>
          <LinearGradient id={`glass-${variant}`} x1="0" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={C.surface} stopOpacity={0.72} />
            <Stop offset="0.55" stopColor={LAVENDER} stopOpacity={0.22} />
            <Stop offset="1" stopColor={C.primary} stopOpacity={0.1} />
          </LinearGradient>
          <LinearGradient id={`glassEdge-${variant}`} x1="0" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={C.primary} stopOpacity={0.1} />
            <Stop offset="1" stopColor={C.primary} stopOpacity={0.28} />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width="390" height="844" fill={`url(#base-${variant})`} />
        <Rect x="0" y="0" width="390" height="844" fill={`url(#wash-${variant})`} />
        <Circle cx={TL.x} cy={TL.y} r={290} fill={`url(#field-${variant})`} />
        {hero ? <Circle cx={TR.x} cy={TR.y} r={190} fill={`url(#corner-${variant})`} /> : null}
        <Ellipse cx={10} cy={800} rx={240} ry={190} fill={`url(#depth-${variant})`} />

        <Path d={LOW_BAND} fill={`url(#band-${variant})`} />
        <Path d={LOW_BAND_EDGE} fill="none" stroke={C.surface} strokeOpacity={0.95} strokeWidth={1.5} />

        {TOP_RING.map((d, i) => (
          <Path
            key={`tr-${i}`}
            d={d}
            fill="none"
            stroke={i === 0 ? LAVENDER_DEEP : C.primary}
            strokeOpacity={(i === 0 ? 0.32 : 0.2) * k}
            strokeWidth={i === 3 ? 1.6 : 1.2}
            strokeLinecap="round"
          />
        ))}
        {LOW_RING.map((d, i) => (
          <Path
            key={`lr-${i}`}
            d={d}
            fill="none"
            stroke={C.primary}
            strokeOpacity={(0.16 + (i % 2) * 0.1) * k}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        ))}

        {hero ? (
          <>
            {TOP_RIGHT_RING.map((d, i) => (
              <Path
                key={`rr-${i}`}
                d={d}
                fill="none"
                stroke={C.primary}
                strokeOpacity={0.2}
                strokeWidth={1.15}
                strokeLinecap="round"
              />
            ))}

            {/* Diagonal glass plane — structure, not decoration blob */}
            <Path d={GLASS_PLANE} fill={`url(#plane-${variant})`} />
            <Path d={GLASS_PLANE_EDGE} fill="none" stroke={C.surface} strokeOpacity={0.9} strokeWidth={1.25} />

            {/* One crisp yellow accent on the orbit (replaces old soft yellow spot). */}
            <Path d={YELLOW_ACCENT} fill="none" stroke={C.yellow} strokeOpacity={0.95} strokeWidth={2.5} strokeLinecap="round" />

            <Path d={SHIELD} fill={`url(#glass-${variant})`} stroke={`url(#glassEdge-${variant})`} strokeWidth={1.2} />
            <Path d={SHIELD_INNER} fill="none" stroke={C.surface} strokeOpacity={0.88} strokeWidth={1} />
            <Path d={SHIELD_CROSS} fill="none" stroke={C.primary} strokeOpacity={0.2} strokeWidth={1.2} strokeLinejoin="round" />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

/** Static logo lockup (symbol over wordmark) for form screens. */
export function BrandMark({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  const wordW = Math.round(size * 1.9);
  return (
    <View style={[styles.brandMark, style]} pointerEvents="none">
      <Image
        source={BRAND_SYMBOL}
        style={{ width: Math.round(size * SYMBOL_ASPECT), height: size }}
        contentFit="contain"
        transition={0}
      />
      <Image
        source={BRAND_WORDMARK}
        style={{ width: wordW, height: Math.round(wordW / WORDMARK_ASPECT), marginTop: Math.round(size * 0.2) }}
        contentFit="contain"
        transition={0}
      />
    </View>
  );
}

export function AuthHeader({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Feather name="chevron-left" size={22} color={C.primary} />
      </Pressable>
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  prefix?: string;
  prefixA11y?: string;
  accessory?: ReactNode;
};

const webInput =
  Platform.OS === 'web'
    ? ({
        outlineStyle: 'none',
        boxShadow: `0 0 0px 1000px ${C.surface} inset`,
        WebkitBoxShadow: `0 0 0px 1000px ${C.surface} inset`,
        WebkitTextFillColor: C.ink,
        caretColor: C.primary,
      } as object)
    : null;

export const AuthField = forwardRef<TextInput, FieldProps>(function AuthField(
  { label, error, hint, icon, prefix, prefixA11y, accessory, onFocus, onBlur, style, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const edge = error ? C.danger : focused ? C.primary : FIELD_EDGE;
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, { borderColor: edge }, focused && !error && styles.fieldFocused]}>
        {icon ? <Feather name={icon} size={18} color={focused ? C.primary : C.secondary} /> : null}
        {prefix ? (
          <Text style={styles.prefix} accessibilityLabel={prefixA11y}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={MUTED_TEXT}
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, webInput, style]}
        />
        {accessory}
      </View>
      {error ? (
        <View style={styles.fieldErrorRow} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={13} color={C.danger} />
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export function PasswordToggle({ visible, onToggle, showLabel, hideLabel }: { visible: boolean; onToggle: () => void; showLabel: string; hideLabel: string }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      style={styles.toggle}
      accessibilityRole="button"
      accessibilityLabel={visible ? hideLabel : showLabel}
    >
      <Feather name={visible ? 'eye-off' : 'eye'} size={18} color={C.secondary} />
    </Pressable>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <View style={styles.formError} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Feather name="alert-circle" size={16} color={C.danger} />
      <Text style={styles.formErrorText}>{message}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant: 'yellow' | 'purple' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Pill CTA shared by the entry flow: 54px, radius 27, 0.98 press scale, fixed size while loading. */
export function AuthButton({ label, onPress, variant, loading, disabled, accessibilityLabel, accessibilityHint, testID, style }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = Boolean(disabled || loading);
  const press = (to: number, ms: number) => easeTo(scale, to, ms, Easing.out(Easing.quad)).start();
  const tone = BUTTON_TONES[variant];
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(0.98, 140)}
        onPressOut={() => press(1, 160)}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
        aria-busy={Boolean(loading)}
        testID={testID}
        style={[styles.button, tone.container, disabled && !loading && styles.buttonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color={tone.spinner} />
        ) : (
          <Text style={[styles.buttonText, tone.text]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const BUTTON_TONES = {
  yellow: {
    container: { backgroundColor: C.yellow, boxShadow: '0px 1px 2px rgba(53,23,101,0.08), 0px 8px 20px rgba(255,210,51,0.32)' },
    text: { color: C.deep },
    spinner: C.deep,
  },
  purple: {
    container: { backgroundColor: C.primary, boxShadow: '0px 1px 2px rgba(23,22,44,0.08), 0px 8px 20px rgba(75,36,138,0.22)' },
    text: { color: C.surface },
    spinner: C.surface,
  },
  outline: {
    container: { backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: 'rgba(75,36,138,0.3)' },
    text: { color: C.primary },
    spinner: C.primary,
  },
} as const;

export function AuthFooterLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerPrompt}>{prompt}</Text>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action} style={styles.footerAction}>
        <Text style={styles.footerLink}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  brandMark: { alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: 'rgba(75,36,138,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 2px rgba(23,22,44,0.04), 0px 4px 12px rgba(53,23,101,0.06)',
  },
  backPressed: { backgroundColor: C.soft },
  headerTitle: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 26, color: C.ink, letterSpacing: -0.3 },

  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18, color: C.ink, marginBottom: 8 },
  field: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: C.surface,
  },
  fieldFocused: { boxShadow: '0px 0px 0px 3px rgba(75,36,138,0.10)' },
  prefix: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22, color: C.ink },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingVertical: 0,
    paddingRight: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: C.ink,
    backgroundColor: 'transparent',
  },
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: 6, fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 17, color: C.secondary },
  fieldErrorRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldError: { flexShrink: 1, fontFamily: 'Inter_500Medium', fontSize: 12.5, lineHeight: 17, color: C.danger },

  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  formErrorText: { flex: 1, minWidth: 0, fontFamily: 'Inter_500Medium', fontSize: 13.5, lineHeight: 19, color: C.danger },

  button: { minHeight: 54, borderRadius: 27, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.45, boxShadow: 'none' },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 22, letterSpacing: 0.1 },

  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 4 },
  footerPrompt: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: C.secondary },
  footerAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  footerLink: { fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 20, color: C.primary },
});
