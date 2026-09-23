import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Language } from '@/lib/languages';

type Props = {
  language: Language;
  /** Flag height in px; width is ~1.45× height. */
  size?: number;
};

/**
 * Drawable language flags (no emoji).
 * Windows/web often render 🇺🇿 as the letters "UZ", which collides with shortCode "UZ".
 */
export function LanguageFlag({ language, size = 16 }: Props) {
  const w = Math.round(size * 1.45);
  const h = Math.round(size);

  return (
    <View
      style={[styles.frame, { width: w, height: h, borderRadius: Math.max(2, Math.round(size * 0.18)) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {language === 'uz' ? <UzFlag /> : language === 'ru' ? <RuFlag /> : <EnFlag />}
    </View>
  );
}

function UzFlag() {
  // Uzbekistan: sky blue / white / green with thin red fimbriations.
  return (
    <View style={styles.fill}>
      <View style={{ flex: 1, backgroundColor: '#0099B5' }} />
      <View style={styles.fimbriation} />
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
      <View style={styles.fimbriation} />
      <View style={{ flex: 1, backgroundColor: '#1EB53A' }} />
    </View>
  );
}

function RuFlag() {
  return (
    <View style={styles.fill}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
      <View style={{ flex: 1, backgroundColor: '#0039A6' }} />
      <View style={{ flex: 1, backgroundColor: '#D52B1E' }} />
    </View>
  );
}

function EnFlag() {
  // Simplified UK cross — readable at badge size without image assets.
  return (
    <View style={[styles.fill, { backgroundColor: '#012169' }]}>
      <View style={styles.ukDiagWhiteA} />
      <View style={styles.ukDiagWhiteB} />
      <View style={styles.ukDiagRedA} />
      <View style={styles.ukDiagRedB} />
      <View style={styles.ukCrossWhiteH} />
      <View style={styles.ukCrossWhiteV} />
      <View style={styles.ukCrossRedH} />
      <View style={styles.ukCrossRedV} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 16, 64, 0.18)',
    backgroundColor: '#EEF0F6',
  },
  fill: { flex: 1, width: '100%', height: '100%' },
  fimbriation: { height: 1, backgroundColor: '#CE1126' },
  ukDiagWhiteA: {
    position: 'absolute',
    width: '140%',
    height: '18%',
    backgroundColor: '#FFFFFF',
    top: '41%',
    left: '-20%',
    transform: [{ rotate: '25deg' }],
  },
  ukDiagWhiteB: {
    position: 'absolute',
    width: '140%',
    height: '18%',
    backgroundColor: '#FFFFFF',
    top: '41%',
    left: '-20%',
    transform: [{ rotate: '-25deg' }],
  },
  ukDiagRedA: {
    position: 'absolute',
    width: '140%',
    height: '8%',
    backgroundColor: '#C8102E',
    top: '46%',
    left: '-20%',
    transform: [{ rotate: '25deg' }],
  },
  ukDiagRedB: {
    position: 'absolute',
    width: '140%',
    height: '8%',
    backgroundColor: '#C8102E',
    top: '46%',
    left: '-20%',
    transform: [{ rotate: '-25deg' }],
  },
  ukCrossWhiteH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    height: '24%',
    backgroundColor: '#FFFFFF',
  },
  ukCrossWhiteV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '38%',
    width: '24%',
    backgroundColor: '#FFFFFF',
  },
  ukCrossRedH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '44%',
    height: '12%',
    backgroundColor: '#C8102E',
  },
  ukCrossRedV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '44%',
    width: '12%',
    backgroundColor: '#C8102E',
  },
});
