import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function NotFoundScreen() {
  const colors = useColors();
  const { t } = useApp();

  return (
    <>
      <Stack.Screen options={{ title: t('common.navNotFound') }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('profile.notFoundMessage')}</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>{t('profile.notFoundHome')}</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  link: {
    marginTop: 16,
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
