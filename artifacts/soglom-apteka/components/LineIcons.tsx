import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Crisp SVG line icons (24px grid). Prefer these over icon fonts on web/Electron — fonts often look soft. */
type IconProps = { size?: number; color: string; strokeWidth?: number };

function Line({ size = 24, color, strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
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
    >
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

export function ShoppingBagIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Path d="M3 6h18" />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Line>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx={12} cy={10} r={3} fill="none" />
    </Line>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M3 9.5L12 3l9 6.5" />
      <Path d="M5 8.5V20h14V8.5" />
      <Path d="M9 20v-6h6v6" />
    </Line>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Line>
  );
}

export function SmartphoneIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Rect x={7} y={2} width={10} height={20} rx={2} fill="none" />
      <Path d="M11 18h2" />
    </Line>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <Path d="M3 12h18" />
      <Path d="M12 3a14 14 0 0 1 0 18" />
      <Path d="M12 3a14 14 0 0 0 0 18" />
    </Line>
  );
}

export function HeadphonesIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M3 14v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H3z" />
      <Path d="M21 14v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3z" />
      <Path d="M3 14a9 9 0 0 1 18 0" />
    </Line>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 2.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.5 6.6 19.3l1-6.1L3.2 8.9l6.1-.9L12 2.5z" />
    </Line>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Circle cx={12} cy={12} r={9} fill="none" />
      <Path d="M12 11v5" />
      <Path d="M12 8h.01" />
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

export type ProfileMenuIconName =
  | 'wallet'
  | 'shopping-bag'
  | 'map-pin'
  | 'home'
  | 'bell'
  | 'smartphone'
  | 'globe'
  | 'headphones'
  | 'star'
  | 'info';

const PROFILE_ICONS: Record<ProfileMenuIconName, React.ComponentType<IconProps>> = {
  wallet: WalletIcon,
  'shopping-bag': ShoppingBagIcon,
  'map-pin': MapPinIcon,
  home: HomeIcon,
  bell: BellIcon,
  smartphone: SmartphoneIcon,
  globe: GlobeIcon,
  headphones: HeadphonesIcon,
  star: StarIcon,
  info: InfoIcon,
};

/** Profile menu glyphs — always SVG, never icon-font. */
export function ProfileMenuIcon({
  name,
  size = 20,
  color,
  strokeWidth = 1.85,
}: IconProps & { name: ProfileMenuIconName }) {
  const Comp = PROFILE_ICONS[name];
  return <Comp size={size} color={color} strokeWidth={strokeWidth} />;
}
