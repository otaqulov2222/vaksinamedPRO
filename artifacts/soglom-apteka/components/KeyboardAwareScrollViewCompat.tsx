import { Platform, ScrollView, ScrollViewProps } from 'react-native';

type Props = ScrollViewProps & {
  bottomOffset?: number;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
};

/**
 * Use RN ScrollView on native to avoid keyboard-controller/reanimated boot crashes
 * on release APKs. Web keeps the same scroll behavior.
 */
export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset: _bottomOffset,
  ...props
}: Props) {
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
