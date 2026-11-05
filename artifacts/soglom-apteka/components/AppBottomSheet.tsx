import React, { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tr } from '@/lib/i18n';

const SCRIM = 'rgba(23, 22, 44, 0.45)';
const SURFACE = '#FFFFFF';
const HANDLE = '#D4D0DE';
const SLIDE_DISTANCE = 420;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
};

/**
 * Native-style modal bottom sheet (grabber + rounded top).
 * Scrim fades; sheet slides — avoids RN Modal `slide` (scrim+sheet move together on web).
 */
export function AppBottomSheet({ visible, onClose, children, testID }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxH = Math.min(height * 0.72, 480);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 12);

  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      progress.stopAnimation();
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        damping: 24,
        stiffness: 260,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) return;

    closingRef.current = true;
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && closingRef.current) {
        setMounted(false);
      }
    });
  }, [visible, mounted, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SLIDE_DISTANCE, 0],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} testID={testID}>
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.scrim, { opacity: progress }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: maxH,
              paddingBottom: bottomPad,
              opacity: progress.interpolate({
                inputRange: [0, 0.35, 1],
                outputRange: [0, 1, 1],
              }),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handleWrap} importantForAccessibility="no">
            <View style={styles.handle} />
          </View>
          <View style={styles.body}>{children}</View>
        </Animated.View>
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
    overflow: 'hidden',
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
    paddingTop: 8,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HANDLE,
  },
  body: {
    // Hug content — do not stretch the sheet to maxHeight.
    flexGrow: 0,
    flexShrink: 1,
  },
});
