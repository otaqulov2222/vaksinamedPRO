import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function NotFoundScreen() {
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: 'Sahifa topilmadi' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Bu sahifa topilmadi</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Bosh sahifaga qaytish</Text>
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
