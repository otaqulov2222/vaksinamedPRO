import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/AppUI';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const FALLBACK_BG = '#F3E8FF';

type Promo = {
  id: number;
  title: string;
  subtitle: string;
  tag: string;
  icon: string;
  background: string;
  active?: boolean;
};

function isIconName(name: string): name is React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  return name in MaterialCommunityIcons.glyphMap;
}

export default function PromosScreen() {
  const { t } = useApp();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(() => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    void api
      .promos()
      .then((data) => {
        if (gen !== loadGenRef.current) return;
        const list = Array.isArray(data.promos) ? data.promos : [];
        setPromos(
          list
            .filter((p) => p && p.active !== false)
            .map((p) => ({
              id: Number(p.id),
              title: String(p.title || ''),
              subtitle: String(p.subtitle || ''),
              tag: String(p.tag || ''),
              icon: String(p.icon || 'tag-outline'),
              background: String(p.background || FALLBACK_BG),
              active: p.active,
            }))
            .filter((p) => p.id && p.title),
        );
      })
      .catch((err: unknown) => {
        if (gen !== loadGenRef.current) return;
        setPromos([]);
        setError({ cause: err });
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      loadGenRef.current += 1;
    };
  }, [load]);

  return (
    <Screen>
      <View style={styles.heading}>
        <Text style={styles.title}>{t('home.promosTitle')}</Text>
        <Text style={styles.subtitle}>{t('home.promosSubtitle')}</Text>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={PURPLE} size="large" />
          <Text style={styles.stateText}>{t('common.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Feather name="cloud-off" size={40} color={MUTED} />
          <Text style={styles.stateTitle}>{t('home.promosLoadFailed')}</Text>
          <Text style={styles.stateText}>
            {localizeError(error.cause, t, { fallback: 'home.promosLoadFailed' })}
          </Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : promos.length === 0 ? (
        <View style={styles.state}>
          <MaterialCommunityIcons name="tag-off-outline" size={44} color={MUTED} />
          <Text style={styles.stateTitle}>{t('home.promosEmptyTitle')}</Text>
          <Text style={styles.stateText}>{t('home.promosEmptyText')}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>{t('common.refresh')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {promos.map((promo) => {
            const iconName = isIconName(promo.icon) ? promo.icon : 'tag-outline';
            return (
              <Pressable
                key={String(promo.id)}
                onPress={() => router.push('/(tabs)/catalog')}
                style={({ pressed }) => [
                  styles.promo,
                  { backgroundColor: promo.background || FALLBACK_BG, opacity: pressed ? 0.78 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('home.promoA11y', { title: promo.title })}
              >
                <View style={styles.promoCopy}>
                  {promo.tag ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{promo.tag}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.promoTitle}>{promo.title}</Text>
                  {promo.subtitle ? <Text style={styles.promoSubtitle}>{promo.subtitle}</Text> : null}
                  <Text style={styles.promoHonest}>{t('home.promoDisclaimer')}</Text>
                  <Text style={styles.open}>
                    {t('home.promoOpenCatalog')} <Feather name="arrow-right" size={13} color={PURPLE} />
                  </Text>
                </View>
                <View style={styles.promoArt}>
                  <MaterialCommunityIcons name={iconName} size={66} color={PURPLE} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 18 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, color: PURPLE_DEEP },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5, color: MUTED },
  list: { gap: 12, paddingBottom: 24 },
  promo: {
    minHeight: 164,
    borderRadius: 23,
    padding: 18,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  promoCopy: { flex: 1 },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  tagText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: PURPLE },
  promoTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 15,
    maxWidth: 190,
    color: PURPLE_DEEP,
  },
  promoSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 6,
    maxWidth: 200,
    color: MUTED,
  },
  promoHonest: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    marginTop: 8,
    maxWidth: 220,
    color: PURPLE,
    lineHeight: 14,
  },
  open: { fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 12, color: PURPLE },
  promoArt: { width: 78, alignItems: 'center', justifyContent: 'center' },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 10,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  stateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
