import { Feather } from '@/components/AppIcon';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const PRIMARY = '#4B248A';
const BG = '#F7F6FA';
const SURFACE = '#FFFFFF';
const INK = '#17162C';
const MUTED = '#64748B';
const BORDER = '#EFEBF6';

/**
 * Pickup-only: Manzillarim shows the selected pharmacy branch.
 * Home delivery remains disabled — no courier address CRUD.
 */
export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { t, isAuthenticated } = useApp();
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState<{ id: number; name: string; address?: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        setLoading(true);
        try {
          if (!isAuthenticated) {
            if (alive) setBranch(null);
            return;
          }
          const cartRes = await api.cart().catch(() => null);
          const row = cartRes?.branch;
          const id = Number(row?.id);
          if (alive) {
            if (Number.isFinite(id) && id > 0 && row?.name) {
              setBranch({
                id,
                name: String(row.name).trim(),
                address: row.address ? String(row.address) : undefined,
              });
            } else {
              setBranch(null);
            }
          }
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [isAuthenticated]),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t('profile.selectedBranchTitle')}</Text>
        {loading ? (
          <ActivityIndicator color={PRIMARY} style={{ marginVertical: 16 }} />
        ) : (
          <>
            <View style={styles.iconWrap}>
              <Feather name="map-pin" size={28} color={PRIMARY} />
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {branch?.name || t('profile.selectedBranchNone')}
            </Text>
            {branch?.address ? (
              <Text style={styles.body} numberOfLines={3}>
                {branch.address}
              </Text>
            ) : (
              <Text style={styles.body}>{t('profile.addressesDisabledBody')}</Text>
            )}
            <Pressable
              style={styles.cta}
              onPress={() => router.push({ pathname: '/branches', params: { from: 'profile' } })}
              accessibilityRole="button"
              accessibilityLabel={t('profile.selectedBranchPickA11y')}
              testID="addresses-selected-branch-cta"
            >
              <Text style={styles.ctaText}>
                {branch ? t('common.navBranches') : t('profile.selectedBranchPickA11y')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      <Text style={styles.footnote}>{t('profile.addressesDisabledTitle')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 12,
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  eyebrow: {
    alignSelf: 'stretch',
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: INK,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: 'center',
  },
  cta: {
    marginTop: 8,
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  footnote: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
  },
});
