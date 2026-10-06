import React from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { LatLng } from '@/lib/maps';
import { useApp } from '@/context/AppContext';

type Props = {
  initialCenter?: LatLng | null;
  onLocationChange: (coords: LatLng) => void;
  height?: DimensionValue;
};

export default function InteractiveMapPicker({ height = '100%' }: Props) {
  const { t } = useApp();
  return (
    <View style={[styles.container, { height }]}>
      <Feather name="map-pin" size={40} color="#5C328E" />
      <Text style={styles.title}>{t('branches.mapTitle')}</Text>
      <Text style={styles.sub}>{t('branches.mapNativeNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#F3F0EA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2A104E',
    marginTop: 12,
  },
  sub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
