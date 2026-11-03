import React, { type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCRIM = 'rgba(23, 22, 44, 0.45)';
const SURFACE = '#FFFFFF';
const HANDLE = '#D4D0DE';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
};

/**
 * Native-style modal bottom sheet (grabber + rounded top).
 * Same pattern as common retail apps (e.g. Korzinka language picker).
 */
export function AppBottomSheet({ visible, onClose, children, testID }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxH = Math.min(height * 0.72, 480);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} testID={testID}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { maxHeight: maxH, paddingBottom: bottomPad }]}>
          <View style={styles.handleWrap} importantForAccessibility="no">
            <View style={styles.handle} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SCRIM,
  },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    ...Platform.select({
      web: { boxShadow: '0 -8px 32px rgba(23,22,44,0.12)' } as any,
      default: {
        shadowColor: '#17162C',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12,
      },
    }),
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HANDLE,
  },
});
