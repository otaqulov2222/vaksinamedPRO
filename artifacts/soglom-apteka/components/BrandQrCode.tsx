import React, { memo } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const PURPLE_DEEP = '#1A1040';
/** Transparent brand mark rebuilt from brand-symbol.png (512², no plate). */
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
 * Branded QR — mark sits in the geometric center with a quiet white pad
 * so modules never tangle into the logo. ECL H keeps it scannable.
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
  // Mark ~18% of QR; quiet pad ~26% → clear gap around the symbol.
  const logoSize = Math.max(28, Math.round(size * 0.18));
  const padSize = Math.max(logoSize + 12, Math.round(size * 0.26));
  const padOffset = Math.round((size - padSize) / 2);
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
      />
      <View
        pointerEvents="none"
        style={[
          styles.logoPad,
          {
            width: padSize,
            height: padSize,
            borderRadius: padSize / 2,
            left: padOffset,
            top: padOffset,
          },
        ]}
      >
        <Image
          source={LOGO}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  logoPad: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});

export default BrandQrCode;
