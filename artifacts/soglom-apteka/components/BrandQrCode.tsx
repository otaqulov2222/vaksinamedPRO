import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const PURPLE_DEEP = '#1A1040';
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
 * Branded QR — Vaksina Med mark centered with high error correction (H)
 * so scanners still read through the logo pad.
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
  const logoSize = Math.round(size * 0.22);
  const quietZone = Math.max(6, Math.round(size * 0.04));

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
        logoBackgroundColor="#FFFFFF"
        logoMargin={Math.max(3, Math.round(logoSize * 0.12))}
        logoBorderRadius={Math.round(logoSize * 0.28)}
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
