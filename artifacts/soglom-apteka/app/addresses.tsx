import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DeliveryMapPickerModal from '@/components/DeliveryMapPickerModal';
import { useApp } from '@/context/AppContext';
import { api, type CustomerSavedAddress } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import type { DeliveryAddressSelection } from '@/lib/maps';

const PRIMARY = '#4B248A';
const PRIMARY_DEEP = '#351765';
const BG = '#F8F5FF';
const SURFACE = '#FFFFFF';
const INK = '#17162C';
const SECONDARY = '#64748B';
const BORDER = '#E2E8F0';
const DANGER = '#DC2626';

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();

  const [addresses, setAddresses] = useState<CustomerSavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const loadAddresses = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getAddresses();
      if (Array.isArray(res?.addresses)) {
        setAddresses(res.addresses);
      }
    } catch {
      setError(t('common.errorLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadAddresses();
    }, [loadAddresses]),
  );

  const handleSetDefault = async (item: CustomerSavedAddress) => {
    if (item.isDefault || actionLoadingId) return;
    setActionLoadingId(item.id);
    try {
      await api.updateAddress(item.id, { isDefault: true });
      await loadAddresses();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (item: CustomerSavedAddress) => {
    if (actionLoadingId) return;
    const ok = await confirmAction({
      title: t('profile.deleteAddress'),
      message: t('profile.deleteAddressConfirm'),
      confirmText: t('common.yes'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;

    setActionLoadingId(item.id);
    try {
      await api.deleteAddress(item.id);
      await loadAddresses();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePickerConfirm = async (sel: DeliveryAddressSelection) => {
    setPickerVisible(false);
    setLoading(true);
    try {
      await api.createAddress({
        label: 'home',
        formattedAddress: sel.formattedAddress,
        latitude: sel.latitude,
        longitude: sel.longitude,
        district: sel.district,
        street: sel.street,
        house: sel.house,
        apartment: sel.apartment,
        entrance: sel.entrance,
        floor: sel.floor,
        landmark: sel.landmark,
        courierNote: sel.courierNote,
        isDefault: addresses.length === 0,
      });
      await loadAddresses();
    } catch {
      // Error handled by next fetch or alert
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = (label: string) => {
    if (label === 'work') {
      return <Feather name="briefcase" size={18} color={PRIMARY} />;
    }
    if (label === 'other') {
      return <Feather name="map-pin" size={18} color={PRIMARY} />;
    }
    return <Feather name="home" size={18} color={PRIMARY} />;
  };

  const labelTitle = (item: CustomerSavedAddress) => {
    if (item.title && item.title.trim().length > 0) return item.title;
    if (item.label === 'work') return t('profile.addressLabelWork');
    if (item.label === 'other') return t('profile.addressLabelOther');
    return t('profile.addressLabelHome');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>{t('profile.addressesTitle')}</Text>
            <Text style={styles.subtitle}>{t('profile.addressesDesc')}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => setPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.addAddress')}
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{t('profile.addAddress')}</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={PRIMARY} />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadAddresses}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : addresses.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Feather name="map-pin" size={32} color={PRIMARY} />
            </View>
            <Text style={styles.emptyTitle}>{t('profile.noAddresses')}</Text>
            <Text style={styles.emptyBody}>{t('profile.noAddressesHint')}</Text>
            <Pressable
              style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.pressed]}
              onPress={() => setPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.addAddress')}
            >
              <Feather name="plus-circle" size={18} color="#FFFFFF" />
              <Text style={styles.emptyAddBtnText}>{t('profile.addAddress')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {addresses.map((item) => {
              const isWorking = actionLoadingId === item.id;
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.labelBadge}>
                      {renderIcon(item.label)}
                      <Text style={styles.labelText}>{labelTitle(item)}</Text>
                    </View>
                    {item.isDefault ? (
                      <View style={styles.defaultBadge}>
                        <Feather name="check-circle" size={12} color="#059669" />
                        <Text style={styles.defaultBadgeText}>
                          {t('profile.addressDefaultBadge')}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.addressText}>{item.formattedAddress}</Text>

                  <View style={styles.chipRow}>
                    {item.house ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipLabel}>{t('profile.addressHouse')}:</Text>
                        <Text style={styles.metaChipVal}>{item.house}</Text>
                      </View>
                    ) : null}
                    {item.apartment ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipLabel}>{t('profile.addressApartment')}:</Text>
                        <Text style={styles.metaChipVal}>{item.apartment}</Text>
                      </View>
                    ) : null}
                    {item.entrance ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipLabel}>{t('profile.addressEntrance')}:</Text>
                        <Text style={styles.metaChipVal}>{item.entrance}</Text>
                      </View>
                    ) : null}
                    {item.floor ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipLabel}>{t('profile.addressFloor')}:</Text>
                        <Text style={styles.metaChipVal}>{item.floor}</Text>
                      </View>
                    ) : null}
                  </View>

                  {item.landmark ? (
                    <View style={styles.extraNoteRow}>
                      <Feather name="compass" size={13} color={SECONDARY} />
                      <Text style={styles.extraNoteText}>
                        {t('profile.addressLandmark')}: {item.landmark}
                      </Text>
                    </View>
                  ) : null}

                  {item.courierNote ? (
                    <View style={styles.extraNoteRow}>
                      <MaterialCommunityIcons name="comment-text-outline" size={14} color={SECONDARY} />
                      <Text style={styles.extraNoteText}>
                        {t('profile.addressNote')}: {item.courierNote}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cardActions}>
                    {!item.isDefault ? (
                      <Pressable
                        style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                        onPress={() => handleSetDefault(item)}
                        disabled={isWorking}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.setAsDefault')}
                      >
                        <Feather name="star" size={14} color={PRIMARY} />
                        <Text style={styles.actionBtnText}>{t('profile.setAsDefault')}</Text>
                      </Pressable>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}

                    <Pressable
                      style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                      onPress={() => handleDelete(item)}
                      disabled={isWorking}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.deleteAddress')}
                    >
                      <Feather name="trash-2" size={14} color={DANGER} />
                      <Text style={styles.deleteBtnText}>{t('profile.deleteAddress')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <DeliveryMapPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onConfirm={handlePickerConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  headerTextCol: { flex: 1 },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: INK,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: SECONDARY,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
      android: { elevation: 3 },
      web: { boxShadow: '0 2px 8px rgba(75, 36, 138, 0.18)' },
    }),
  },
  addBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    padding: 24,
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: DANGER,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: DANGER,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 12,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)' },
    }),
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: INK,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: SECONDARY,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyAddBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  list: { gap: 12 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)' },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  labelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3E8FF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  labelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PRIMARY,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  defaultBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#059669',
  },
  addressText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14.5,
    color: INK,
    lineHeight: 20,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  metaChipLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: SECONDARY,
  },
  metaChipVal: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: INK,
  },
  extraNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  extraNoteText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: SECONDARY,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: PRIMARY,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  deleteBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: DANGER,
  },
  pressed: { opacity: 0.8 },
});
