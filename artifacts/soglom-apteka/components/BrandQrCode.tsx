import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const PURPLE_DEEP = '#1A1040';

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

/** Plain QR — no center logo. */
export const BrandQrCode = memo(function BrandQrCode({
  value,
  size,
  label,
  color = PURPLE_DEEP,
  backgroundColor = '#FFFFFF',
  style,
  testID,
}: Props) {
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
        ecl="M"
        quietZone={quietZone}
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
