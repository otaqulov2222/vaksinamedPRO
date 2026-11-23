import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const PURPLE_DEEP = '#1A1040';
/** Transparent brand mark (no plate) — from brand-symbol.png. */
const LOGO = require('../assets/images/qr-center-logo.png');

type Props = {
  value: string;
  size: number;
  /** Accessibility label for the QR image. */
  label?: string;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Branded QR — logo is drawn inside the QR SVG (not a sticker on top).
 * Square clear zone + margin so modules never touch the mark.
 * No circular white badge. ECL H keeps it scannable.
 */
export const BrandQrCode = memo(function BrandQrCode({
  value,
  size,
  label,
  color = PURPLE_DEEP,
  backgroundColor = '#FFFFFF',
  style,
  testID,
}: Props) {
  // Mark ~15% of canvas; margin ~38% of mark → clear gap, modules don't touch.
  const logoSize = Math.max(24, Math.round(size * 0.15));
  const logoMargin = Math.max(8, Math.round(logoSize * 0.38));
  const quietZone = Math.max(4, Math.round(size * 0.03));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID={testID}
    >
      <QRCode
        value={value}
        size={size}
        color={color}
        backgroundColor={backgroundColor}
        ecl="H"
        quietZone={quietZone}
        logo={LOGO}
        logoSize={logoSize}
        logoMargin={logoMargin}
        logoBackgroundColor={backgroundColor}
        logoBorderRadius={0}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BrandQrCode;
