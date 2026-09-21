import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  fallback?: Href;
  label?: string;
  tint?: string;
};

/** Barcha stack bo‘limlarda ko‘rinadigan orqaga tugmasi (web + mobile). */
export function HeaderBackButton({ fallback = '/', label = 'Orqaga', tint = '#5C328E' }: Props) {
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  };

  return (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.65 : 1 }]}
    >
      <View style={styles.iconWrap}>
        <Feather name="chevron-left" size={22} color={tint} />
      </View>
      {Platform.OS === 'ios' ? <Text style={[styles.label, { color: tint }]}>{label}</Text> : null}
      {Platform.OS === 'web' ? <Text style={[styles.label, { color: tint }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
    marginLeft: Platform.OS === 'web' ? 4 : -4,
    minWidth: 44,
    minHeight: 44,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F3EAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginLeft: 4,
  },
});
