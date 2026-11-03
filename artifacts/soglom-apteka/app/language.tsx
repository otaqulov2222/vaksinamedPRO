import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LanguagePickerSheet } from '@/components/LanguagePickerSheet';
import { useApp } from '@/context/AppContext';

/**
 * Deep-link / legacy route: open the universal language bottom sheet,
 * then return to the previous screen (profile or welcome).
 */
export default function LanguageScreen() {
  const { isAuthenticated } = useApp();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
  }, []);

  const close = () => {
    setOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace(isAuthenticated ? '/(tabs)/profile' : '/welcome');
  };

  return (
    <View style={styles.root}>
      <LanguagePickerSheet visible={open} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
});
