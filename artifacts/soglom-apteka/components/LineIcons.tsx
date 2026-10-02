import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** Feather-compatible line icons (24px grid, round caps) for glyphs Feather does not ship. */
type IconProps = { size?: number; color: string; strokeWidth?: number };

function Line({ size = 24, color, strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function CrownIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M3.5 8.5l4.2 3.6L12 5.5l4.3 6.6 4.2-3.6-1.8 9.5H5.3L3.5 8.5z" />
      <Path d="M5.5 20.5h13" />
    </Line>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5" />
      <Path d="M3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
      <Path d="M3 6.5A2.5 2.5 0 0 0 5.5 9h13A1.5 1.5 0 0 1 20 10.5V11" />
      <Path d="M16.5 11H21v4h-4.5a2 2 0 0 1 0-4z" />
    </Line>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Rect x={3} y={3} width={6} height={6} rx={1.2} />
      <Rect x={15} y={3} width={6} height={6} rx={1.2} />
      <Rect x={3} y={15} width={6} height={6} rx={1.2} />
      <Path d="M15 15h2.5v2.5H15zM21 15v.01M18.5 21H21v-2.5M15 21v-.01M12 3v4M12 11v2h-2M3 12h4M17 12h4" />
    </Line>
  );
}
