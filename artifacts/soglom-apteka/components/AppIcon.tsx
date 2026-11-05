import React from 'react';
import { type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { Feather as FeatherFont } from '@expo/vector-icons';

/**
 * System-wide crisp SVG icons (Feather-compatible names).
 * Icon fonts (Feather.ttf) look soft on Electron/web — prefer this for all UI chrome.
 * Unknown names fall back to Feather so nothing breaks.
 */
type Props = {
  name: string;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle | TextStyle>;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
};

type GlyphProps = { size: number; color: string; strokeWidth: number; style?: StyleProp<ViewStyle | TextStyle> };

function Glyph({
  size,
  color,
  strokeWidth,
  style,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style as object}
    >
      {children}
    </Svg>
  );
}

const g = (children: React.ReactNode) => (p: GlyphProps) => <Glyph {...p}>{children}</Glyph>;

const ICONS: Record<string, (p: GlyphProps) => React.ReactElement> = {
  'alert-circle': g(
    <>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <SvgLine x1={12} y1={8} x2={12} y2={12} />
      <SvgLine x1={12} y1={16} x2={12.01} y2={16} />
    </>,
  ),
  'alert-triangle': g(
    <>
      <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <SvgLine x1={12} y1={9} x2={12} y2={13} />
      <SvgLine x1={12} y1={17} x2={12.01} y2={17} />
    </>,
  ),
  'arrow-left': g(
    <>
      <SvgLine x1={19} y1={12} x2={5} y2={12} />
      <Polyline points="12 19 5 12 12 5" />
    </>,
  ),
  'arrow-right': g(
    <>
      <SvgLine x1={5} y1={12} x2={19} y2={12} />
      <Polyline points="12 5 19 12 12 19" />
    </>,
  ),
  bell: g(
    <>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>,
  ),
  'bell-off': g(
    <>
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <Path d="M18.63 13A17.9 17.9 0 0 1 18 8" />
      <Path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <Path d="M18 8a6 6 0 0 0-9.33-5" />
      <SvgLine x1={1} y1={1} x2={23} y2={23} />
    </>,
  ),
  check: g(<Polyline points="20 6 9 17 4 12" />),
  'check-circle': g(
    <>
      <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <Polyline points="22 4 12 14.01 9 11.01" />
    </>,
  ),
  'chevron-down': g(<Polyline points="6 9 12 15 18 9" />),
  'chevron-left': g(<Polyline points="15 18 9 12 15 6" />),
  'chevron-right': g(<Polyline points="9 18 15 12 9 6" />),
  'chevron-up': g(<Polyline points="18 15 12 9 6 15" />),
  clock: g(
    <>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <Polyline points="12 6 12 12 16 14" />
    </>,
  ),
  'cloud-off': g(
    <>
      <Path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
      <SvgLine x1={1} y1={1} x2={23} y2={23} />
    </>,
  ),
  copy: g(
    <>
      <Rect x={9} y={9} width={13} height={13} rx={2} fill="none" />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  ),
  'edit-2': g(
    <>
      <Path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </>,
  ),
  'edit-3': g(
    <>
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>,
  ),
  eye: g(
    <>
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx={12} cy={12} r={3} fill="none" />
    </>,
  ),
  'eye-off': g(
    <>
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <SvgLine x1={1} y1={1} x2={23} y2={23} />
      <Path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </>,
  ),
  'file-text': g(
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Polyline points="14 2 14 8 20 8" />
      <SvgLine x1={16} y1={13} x2={8} y2={13} />
      <SvgLine x1={16} y1={17} x2={8} y2={17} />
      <Polyline points="10 9 9 9 8 9" />
    </>,
  ),
  gift: g(
    <>
      <Polyline points="20 12 20 22 4 22 4 12" />
      <Rect x={2} y={7} width={20} height={5} fill="none" />
      <SvgLine x1={12} y1={22} x2={12} y2={7} />
      <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>,
  ),
  globe: g(
    <>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <SvgLine x1={2} y1={12} x2={22} y2={12} />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>,
  ),
  hash: g(
    <>
      <SvgLine x1={4} y1={9} x2={20} y2={9} />
      <SvgLine x1={4} y1={15} x2={20} y2={15} />
      <SvgLine x1={10} y1={3} x2={8} y2={21} />
      <SvgLine x1={16} y1={3} x2={14} y2={21} />
    </>,
  ),
  headphones: g(
    <>
      <Path d="M3 14v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H3z" />
      <Path d="M21 14v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3z" />
      <Path d="M3 14a9 9 0 0 1 18 0" />
    </>,
  ),
  'help-circle': g(
    <>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <SvgLine x1={12} y1={17} x2={12.01} y2={17} />
    </>,
  ),
  home: g(
    <>
      <Path d="M3 9.5L12 3l9 6.5" />
      <Path d="M5 8.5V20h14V8.5" />
      <Path d="M9 20v-6h6v6" />
    </>,
  ),
  info: g(
    <>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <SvgLine x1={12} y1={11} x2={12} y2={16} />
      <SvgLine x1={12} y1={8} x2={12.01} y2={8} />
    </>,
  ),
  key: g(
    <>
      <Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </>,
  ),
  lock: g(
    <>
      <Rect x={3} y={11} width={18} height={11} rx={2} fill="none" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>,
  ),
  'log-out': g(
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <SvgLine x1={21} y1={12} x2={9} y2={12} />
    </>,
  ),
  map: g(
    <>
      <Polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <SvgLine x1={8} y1={2} x2={8} y2={18} />
      <SvgLine x1={16} y1={6} x2={16} y2={22} />
    </>,
  ),
  'map-pin': g(
    <>
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx={12} cy={10} r={3} fill="none" />
    </>,
  ),
  'message-square': g(
    <>
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </>,
  ),
  monitor: g(
    <>
      <Rect x={2} y={3} width={20} height={14} rx={2} fill="none" />
      <SvgLine x1={8} y1={21} x2={16} y2={21} />
      <SvgLine x1={12} y1={17} x2={12} y2={21} />
    </>,
  ),
  'more-vertical': (p) => (
    <Glyph {...p}>
      <Circle cx={12} cy={5} r={1.35} fill={p.color} stroke="none" />
      <Circle cx={12} cy={12} r={1.35} fill={p.color} stroke="none" />
      <Circle cx={12} cy={19} r={1.35} fill={p.color} stroke="none" />
    </Glyph>
  ),
  navigation: g(<Polygon points="3 11 22 2 13 21 11 13 3 11" />),
  package: g(
    <>
      <Path d="M16.5 9.4l-9-5.19" />
      <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <Polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <SvgLine x1={12} y1={22.08} x2={12} y2={12} />
    </>,
  ),
  phone: g(
    <>
      <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.34 1.54.57 2.35.7A2 2 0 0 1 22 16.92z" />
    </>,
  ),
  plus: g(
    <>
      <SvgLine x1={12} y1={5} x2={12} y2={19} />
      <SvgLine x1={5} y1={12} x2={19} y2={12} />
    </>,
  ),
  'plus-circle': g(
    <>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <SvgLine x1={12} y1={8} x2={12} y2={16} />
      <SvgLine x1={8} y1={12} x2={16} y2={12} />
    </>,
  ),
  'refresh-cw': g(
    <>
      <Polyline points="23 4 23 10 17 10" />
      <Polyline points="1 20 1 14 7 14" />
      <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>,
  ),
  search: g(
    <>
      <Circle cx={11} cy={11} r={7} fill="none" />
      <SvgLine x1={21} y1={21} x2={16.65} y2={16.65} />
    </>,
  ),
  shield: g(<Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  'shopping-bag': g(
    <>
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <SvgLine x1={3} y1={6} x2={21} y2={6} />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </>,
  ),
  'shopping-cart': (p) => (
    <Glyph {...p}>
      <Circle cx={9} cy={21} r={1.2} fill={p.color} stroke="none" />
      <Circle cx={20} cy={21} r={1.2} fill={p.color} stroke="none" />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Glyph>
  ),
  smartphone: g(
    <>
      <Rect x={7} y={2} width={10} height={20} rx={2} fill="none" />
      <SvgLine x1={11} y1={18} x2={13} y2={18} />
    </>,
  ),
  star: g(
    <Path d="M12 2.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.5 6.6 19.3l1-6.1L3.2 8.9l6.1-.9L12 2.5z" />,
  ),
  'trash-2': g(
    <>
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>,
  ),
  'trending-up': g(
    <>
      <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <Polyline points="17 6 23 6 23 12" />
    </>,
  ),
  user: g(
    <>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} fill="none" />
    </>,
  ),
  x: g(
    <>
      <SvgLine x1={18} y1={6} x2={6} y2={18} />
      <SvgLine x1={6} y1={6} x2={18} y2={18} />
    </>,
  ),
};

/** Drop-in Feather replacement for UI chrome. */
export function AppIcon({ name, size = 24, color = '#000', strokeWidth = 1.85, style }: Props) {
  const stroke = typeof color === 'string' ? color : '#000';
  const Comp = ICONS[name];
  if (Comp) {
    return <Comp size={size} color={stroke} strokeWidth={strokeWidth} style={style} />;
  }
  return (
    <FeatherFont
      name={name as React.ComponentProps<typeof FeatherFont>['name']}
      size={size}
      color={stroke}
      style={style as StyleProp<TextStyle>}
    />
  );
}

/** Kept for rare call sites that introspected the font glyph map. */
AppIcon.glyphMap = FeatherFont.glyphMap as Record<string, number>;

/** Alias so existing `<Feather …>` call sites can import AppIcon as Feather. */
export { AppIcon as Feather };
