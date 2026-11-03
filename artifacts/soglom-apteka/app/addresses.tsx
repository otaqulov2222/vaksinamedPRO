import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DeliveryMapPickerModal from '@/components/DeliveryMapPickerModal';
import { useApp } from '@/context/AppContext';
import { api, type CustomerSavedAddress } from '@/lib/api';
import { confirmAction, notify } from '@/lib/dialogs';
import type { DeliveryAddressSelection } from '@/lib/maps';

const PRIMARY = '#4B248A';
const DEEP = '#351765';
const BG = '#F7F6FA';
const SURFACE = '#FFFFFF';
const INK = '#17162C';
const MUTED = '#64748B';
const BORDER = '#EFEBF6';
const DANGER = '#DC2626';

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addresses, setAddresses] = useState<CustomerSavedAddress[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.getAddresses();
      setAddresses(Array.isArray(res.addresses) ? res.addresses : []);
    } catch {
      notify(t('common.errorTitle'), t('common.errorGeneric'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onConfirmPicker = async (selection: DeliveryAddressSelection) => {
    try {
      await api.createAddress({
        label: 'home',
        title: t('profile.addressLabelHome'),
        formattedAddress: selection.formattedAddress.trim(),
        latitude: selection.latitude,
        longitude: selection.longitude,
        district: selection.district ?? null,
        street: selection.street ?? null,
        house: selection.house ?? null,
        apartment: selection.apartment ?? null,
        entrance: selection.entrance ?? null,
        floor: selection.floor ?? null,
        landmark: selection.landmark ?? null,
        courierNote: selection.courierNote ?? null,
        isDefault: addresses.length === 0,
      });
      notify(t('profile.addressAddedSuccess'));
      await load();
    } catch {
      notify(t('common.errorTitle'), t('common.errorGeneric'));
    }
  };

  const onSetDefault = async (id: number) => {
    setBusyId(id);
    try {
      await api.updateAddress(id, { isDefault: true });
      await load();
    } catch {
      notify(t('common.errorTitle'), t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: number) => {
    const ok = await confirmAction({
      title: t('profile.deleteAddress'),
      message: t('profile.deleteAddressConfirm'),
      confirmText: t('profile.deleteAddress'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await api.deleteAddress(id);
      notify(t('profile.addressDeletedSuccess'));
      await load();
    } catch {
      notify(t('common.errorTitle'), t('common.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={PRIMARY} />}
      >
        <Text style={styles.lead}>{t('profile.addressesDesc')}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : addresses.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map-pin" size={28} color={MUTED} />
            <Text style={styles.emptyTitle}>{t('profile.noAddresses')}</Text>
            <Text style={styles.emptyHint}>{t('profile.noAddressesHint')}</Text>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {addr.title || t('profile.addressLabelOther')}
                </Text>
                {addr.isDefault ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t('profile.addressDefaultBadge')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardBody}>{addr.formattedAddress}</Text>
              <View style={styles.cardActions}>
                {!addr.isDefault ? (
                  <Pressable
                    onPress={() => void onSetDefault(addr.id)}
                    disabled={busyId === addr.id}
                    style={styles.linkBtn}
                  >
                    <Text style={styles.linkText}>{t('profile.setAsDefault')}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void onDelete(addr.id)}
                  disabled={busyId === addr.id}
                  style={styles.linkBtn}
                >
                  {busyId === addr.id ? (
                    <ActivityIndicator size="small" color={DANGER} />
                  ) : (
                    <Text style={styles.deleteText}>{t('profile.deleteAddress')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.addAddress')}
          testID="addresses-add"
        >
          <Feather name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>{t('profile.addAddress')}</Text>
        </Pressable>

        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t('common.back')}</Text>
        </Pressable>
      </ScrollView>

      <DeliveryMapPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(sel) => void onConfirmPicker(sel)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 20, maxWidth: 440, width: '100%', alignSelf: 'center', gap: 12 },
  lead: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: MUTED, marginBottom: 4 },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: INK },
  emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, color: MUTED, textAlign: 'center' },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 15, color: DEEP },
  badge: { backgroundColor: '#F1EBFF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: PRIMARY },
  cardBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, color: MUTED },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  linkBtn: { paddingVertical: 4 },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: PRIMARY },
  deleteText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DANGER },
  addBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
  backLink: { alignItems: 'center', paddingVertical: 12 },
  backLinkText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: MUTED },
});
