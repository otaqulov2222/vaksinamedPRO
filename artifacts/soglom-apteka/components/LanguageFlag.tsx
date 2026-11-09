import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Language } from '@/lib/languages';

type Props = {
  language: Language;
  /** Flag height in px; width is ~1.6× height (readable canton for UZ symbols). */
  size?: number;
};

/**
 * Drawable language flags (no emoji).
 * Windows/web often render 🇺🇿 as the letters "UZ", which collides with shortCode "UZ".
 * Uzbekistan includes crescent + 12 stars — state emblem details must stay intact.
 */
/** Official UZ layout: blue / white / green, red fimbriations, crescent + 12 stars (3·4·5). */
function UzFlag({ w, h }: { w: number; h: number }) {
  const band = h / 3;
  const red = Math.max(1, Math.round(h * 0.04));
  const cantonH = band;
  // Crescent in the blue band, left side (hoist).
  const cy = cantonH * 0.5;
  const cx = w * 0.16;
  const rOuter = Math.max(2.2, cantonH * 0.28);
  const rInner = rOuter * 0.72;
  const innerCx = cx + rOuter * 0.32;

  // 12 five-pointed stars: rows of 3, 4, 5 to the right of the crescent.
  const starR = Math.max(0.85, Math.min(2.2, cantonH * 0.085));
  const starCols = [3, 4, 5] as const;
  const starOriginX = cx + rOuter * 1.15;
  const starGapX = Math.max(starR * 2.35, w * 0.055);
  const starGapY = Math.max(starR * 2.1, cantonH * 0.22);
  const starTop = cy - starGapY;

  const stars: { x: number; y: number }[] = [];
  starCols.forEach((count, row) => {
    const y = starTop + row * starGapY;
    const rowWidth = (count - 1) * starGapX;
    const startX = starOriginX + (starCols[2] - 1) * starGapX * 0.5 - rowWidth * 0.5;
    for (let i = 0; i < count; i++) {
      stars.push({ x: startX + i * starGapX, y });
    }
  });

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect x={0} y={0} width={w} height={band} fill="#0099B5" />
      <Rect x={0} y={band} width={w} height={band} fill="#FFFFFF" />
      <Rect x={0} y={band * 2} width={w} height={band} fill="#1EB53A" />
      <Rect x={0} y={band - red / 2} width={w} height={red} fill="#CE1126" />
      <Rect x={0} y={band * 2 - red / 2} width={w} height={red} fill="#CE1126" />

      {/* Crescent: white disc minus offset disc (opens toward stars / fly). */}
      <Circle cx={cx} cy={cy} r={rOuter} fill="#FFFFFF" />
      <Circle cx={innerCx} cy={cy} r={rInner} fill="#0099B5" />

      {stars.map((s, i) => (
        <Path key={i} d={starPath(s.x, s.y, starR)} fill="#FFFFFF" />
      ))}
    </Svg>
  );
}

function starPath(cx: number, cy: number, r: number) {
  const points: string[] = [];
  for (let i = 0; i < 5; i++) {
    const outer = ((-90 + i * 72) * Math.PI) / 180;
    const inner = ((-90 + i * 72 + 36) * Math.PI) / 180;
    const ox = cx + r * Math.cos(outer);
    const oy = cy + r * Math.sin(outer);
    const ix = cx + r * 0.4 * Math.cos(inner);
    const iy = cy + r * 0.4 * Math.sin(inner);
    points.push(`${i === 0 ? 'M' : 'L'}${ox.toFixed(2)} ${oy.toFixed(2)}`);
    points.push(`L${ix.toFixed(2)} ${iy.toFixed(2)}`);
  }
  return `${points.join(' ')} Z`;
}

function RuFlag({ w, h }: { w: number; h: number }) {
  const band = h / 3;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect x={0} y={0} width={w} height={band} fill="#FFFFFF" />
      <Rect x={0} y={band} width={w} height={band} fill="#0039A6" />
      <Rect x={0} y={band * 2} width={w} height={band} fill="#D52B1E" />
    </Svg>
  );
}

function EnFlag(_props: { w: number; h: number }) {
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

const FLAG_BY_LANG: Record<Language, (props: { w: number; h: number }) => React.ReactElement> = {
  uz: UzFlag,
  ru: RuFlag,
  en: EnFlag,
};

export function LanguageFlag({ language, size = 16 }: Props) {
  const h = Math.round(size);
  const w = Math.round(size * 1.6);
  const Flag = FLAG_BY_LANG[language] ?? FLAG_BY_LANG.uz;

  return (
    <View
      style={[styles.frame, { width: w, height: h, borderRadius: Math.max(2, Math.round(size * 0.14)) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Flag w={w} h={h} />
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
