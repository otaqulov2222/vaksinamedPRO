import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import InteractiveMapPicker from '@/components/InteractiveMapPicker';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { toGeocodeLocale } from '@/lib/i18n/format';
import type { DeliveryAddressSelection, LatLng } from '@/lib/maps';
import { TASHKENT_DEFAULT, hasValidCoords } from '@/lib/maps';

const PURPLE = '#5C328E';
const PURPLE_DARK = '#2A104E';
const TEXT_DARK = '#1C1917';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const CARD_BG = '#FFFFFF';
const BG = '#F8F5FF';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (selection: DeliveryAddressSelection) => void;
  initialCoords?: LatLng | null;
  initialAddress?: string;
};

export default function DeliveryMapPickerModal({
  visible,
  onClose,
  onConfirm,
  initialCoords,
  initialAddress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t, language } = useApp();

  const [currentCoords, setCurrentCoords] = useState<LatLng>(
    initialCoords && hasValidCoords(initialCoords) ? initialCoords : TASHKENT_DEFAULT,
  );
  const [resolvedAddress, setResolvedAddress] = useState<string>(initialAddress || '');
  const [resolvedDistrict, setResolvedDistrict] = useState<string | null>(null);
  const [resolvedStreet, setResolvedStreet] = useState<string | null>(null);
  const [resolvedHouse, setResolvedHouse] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const [locatingUser, setLocatingUser] = useState(false);
  const [locPermissionDenied, setLocPermissionDenied] = useState(false);

  const debounceTimer = useRef<any>(null);
  const requestIdRef = useRef(0);

  const doReverseGeocode = useCallback(
    async (coords: LatLng) => {
      const reqId = ++requestIdRef.current;
      setGeocoding(true);
      setGeocodeFailed(false);
      try {
        const langCode = toGeocodeLocale(language);
        const res = await api.reverseGeocode(coords.lat, coords.lng, langCode);
        if (reqId !== requestIdRef.current) return;
        if (res?.formattedAddress) {
          setResolvedAddress(res.formattedAddress);
          setResolvedDistrict(res.district || null);
          setResolvedStreet(res.street || null);
          setResolvedHouse(res.house || null);
          setGeocodeFailed(false);
        } else {
          setGeocodeFailed(true);
        }
      } catch {
        if (reqId === requestIdRef.current) {
          setGeocodeFailed(true);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setGeocoding(false);
        }
      }
    },
    [language],
  );

  const handleLocationChange = useCallback(
    (coords: LatLng) => {
      setCurrentCoords(coords);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        void doReverseGeocode(coords);
      }, 450);
    },
    [doReverseGeocode],
  );

  const handleMyLocation = async () => {
    setLocatingUser(true);
    setLocPermissionDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocPermissionDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userCoords: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCurrentCoords(userCoords);
      void doReverseGeocode(userCoords);
    } catch {
      setLocPermissionDenied(true);
    } finally {
      setLocatingUser(false);
    }
  };

  const handleConfirm = () => {
    onConfirm({
      formattedAddress: resolvedAddress.trim() || `${currentCoords.lat.toFixed(6)}, ${currentCoords.lng.toFixed(6)}`,
      latitude: currentCoords.lat,
      longitude: currentCoords.lng,
      district: resolvedDistrict,
      street: resolvedStreet,
      house: resolvedHouse,
    });
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Feather name="arrow-left" size={24} color={PURPLE_DARK} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('cart.checkoutMapPickerTitle')}</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Map Container with Fixed Center Pin */}
        <View style={styles.mapContainer}>
          <InteractiveMapPicker
            initialCenter={currentCoords}
            onLocationChange={handleLocationChange}
            height="100%"
          />

          {/* Center Selection Pin Overlay */}
          <View pointerEvents="none" style={styles.centerPinWrap}>
            <View style={styles.pinShadow} />
            <View style={styles.pinBody}>
              <Feather name="map-pin" size={32} color={PURPLE} />
            </View>
          </View>

          {/* "My Location" Floating Button */}
          <Pressable
            style={styles.myLocBtn}
            onPress={handleMyLocation}
            accessibilityRole="button"
            accessibilityLabel={t('cart.checkoutMapMyLocation')}
          >
            {locatingUser ? (
              <ActivityIndicator size="small" color={PURPLE} />
            ) : (
              <Feather name="crosshair" size={22} color={PURPLE} />
            )}
          </Pressable>
        </View>

        {/* Bottom Card */}
        <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {locPermissionDenied ? (
            <View style={styles.warnBanner}>
              <Feather name="alert-circle" size={16} color="#D97706" />
              <Text style={styles.warnText}>{t('cart.checkoutMapLocationDenied')}</Text>
            </View>
          ) : null}

          <View style={styles.addressSection}>
            <Text style={styles.addressLabel}>{t('cart.checkoutSelectedAddress')}</Text>
            {geocoding ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={PURPLE} />
                <Text style={styles.locatingText}>{t('cart.checkoutMapLocating')}</Text>
              </View>
            ) : geocodeFailed ? (
              <Text style={styles.failText}>{t('cart.checkoutMapGeocodeFailed')}</Text>
            ) : (
              <Text style={styles.addressText} numberOfLines={3}>
                {resolvedAddress || `${currentCoords.lat.toFixed(6)}, ${currentCoords.lng.toFixed(6)}`}
              </Text>
            )}
          </View>

          <Pressable
            style={[styles.confirmBtn, geocoding && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel={t('cart.checkoutMapSelectLocation')}
          >
            <Text style={styles.confirmBtnText}>{t('cart.checkoutMapSelectLocation')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PURPLE_DARK,
  },
  headerRight: {
    width: 36,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -32,
    marginLeft: -16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pinBody: {
    transform: [{ translateY: -12 }],
  },
  pinShadow: {
    position: 'absolute',
    bottom: -2,
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  myLocBtn: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 12,
  },
  bottomCard: {
    backgroundColor: CARD_BG,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  warnText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  addressSection: {
    marginBottom: 16,
    minHeight: 56,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  locatingText: {
    fontSize: 14,
    color: MUTED,
  },
  failText: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 18,
  },
  addressText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_DARK,
    lineHeight: 20,
  },
  confirmBtn: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
