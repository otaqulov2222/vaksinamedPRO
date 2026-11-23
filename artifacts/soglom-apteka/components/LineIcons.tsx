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

/** Soft-fill + stroke marks for profile edit / notifications tiles. */
export function ProfileUserMark({ size = 22, color, strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.2} r={3.6} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M5.2 19.2c.7-3.4 3.4-5.2 6.8-5.2s6.1 1.8 6.8 5.2"
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path d="M9.2 8.1h.01M14.8 8.1h.01" stroke={color} strokeWidth={strokeWidth + 0.4} strokeLinecap="round" />
    </Svg>
  );
}

export function SecurityLockMark({ size = 22, color, strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.5 10.5V8.2a4.5 4.5 0 0 1 9 0v2.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Rect
        x={5.5}
        y={10.5}
        width={13}
        height={9.2}
        rx={2.4}
        fill={color}
        fillOpacity={0.16}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Circle cx={12} cy={14.6} r={1.35} fill={color} />
      <Path d="M12 15.9v1.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ShieldTipMark({ size = 22, color, strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.2l7.2 2.4v5.6c0 4.5-3 7.8-7.2 9.4-4.2-1.6-7.2-4.9-7.2-9.4V5.6L12 3.2z"
        fill={color}
        fillOpacity={0.16}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M9.1 12.1l2.1 2.1 4.1-4.3"
        stroke={color}
        strokeWidth={strokeWidth + 0.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CalendarBirthMark({ size = 22, color, strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3.5}
        y={5.5}
        width={17}
        height={14}
        rx={2.6}
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path d="M3.5 9.5h17" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 3.8v3.2M16 3.8v3.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={9} cy={14} r={1.05} fill={color} />
      <Circle cx={12} cy={14} r={1.05} fill={color} fillOpacity={0.55} />
      <Circle cx={15} cy={14} r={1.05} fill={color} fillOpacity={0.35} />
    </Svg>
  );
}

export function NotifOrderReadyMark({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 8.2L12 4.4l7.5 3.8v7.6L12 19.6 4.5 15.8V8.2z"
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M12 4.4v15.2M4.5 8.2L12 12l7.5-3.8" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M9.2 13.2l1.7 1.7 3.4-3.5" stroke={color} strokeWidth={strokeWidth + 0.1} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function NotifOrderCancelMark({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M9 9l6 6M15 9l-6 6" stroke={color} strokeWidth={strokeWidth + 0.25} strokeLinecap="round" />
    </Svg>
  );
}

export function NotifOrderDoneMark({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.2 12.2l2.6 2.6 5.2-5.4" stroke={color} strokeWidth={strokeWidth + 0.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function NotifCashbackMark({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.2l1.55 4.05 4.3.35-3.3 2.85.95 4.2L12 12.9 8.5 14.65l.95-4.2-3.3-2.85 4.3-.35L12 3.2z"
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M7.2 18.6h9.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 20.2h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

export function NotifPillMark({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.4 15.6l7.2-7.2a3.2 3.2 0 1 1 4.5 4.5l-7.2 7.2a3.2 3.2 0 1 1-4.5-4.5z"
        fill={color}
        fillOpacity={0.16}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M10.2 13.8l4-4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function NotifAlertMark({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.8L20.2 18.5H3.8L12 3.8z"
        fill={color}
        fillOpacity={0.16}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M12 9.2v4.2" stroke={color} strokeWidth={strokeWidth + 0.15} strokeLinecap="round" />
      <Circle cx={12} cy={15.8} r={0.95} fill={color} />
    </Svg>
  );
}

export type NotifMarkName =
  | 'order-ready'
  | 'order-cancel'
  | 'order-done'
  | 'cashback'
  | 'pill'
  | 'alert';

const NOTIF_MARKS: Record<NotifMarkName, React.ComponentType<IconProps>> = {
  'order-ready': NotifOrderReadyMark,
  'order-cancel': NotifOrderCancelMark,
  'order-done': NotifOrderDoneMark,
  cashback: NotifCashbackMark,
  pill: NotifPillMark,
  alert: NotifAlertMark,
};

export function NotifMark({
  name,
  size = 20,
  color,
  strokeWidth = 1.7,
}: IconProps & { name: NotifMarkName }) {
  const Comp = NOTIF_MARKS[name];
  return <Comp size={size} color={color} strokeWidth={strokeWidth} />;
}
