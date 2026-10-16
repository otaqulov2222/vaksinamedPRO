import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { notify } from '../lib/dialogs';
import { localizedName } from '../lib/i18n/data';

const PURPLE = '#6C38CC';
const PURPLE_DEEP = '#1C025D';
const TEXT_MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const CARD_BG = '#FFFFFF';
const BG = '#F8F9FD';

interface MatchedItemState {
  id: string;
  rawLine: string;
  cleanedQuery: string;
  extractedDosage?: string;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  selected: boolean;
  quantity: number;
  matchedProduct?: {
    id: number;
    sku: string;
    nameUz: string;
    nameRu: string;
    category: string;
    manufacturer: string;
    price: number;
    unit: string;
    requiresPrescription: boolean;
    analogGroup?: string;
    inStock: boolean;
    availableQuantity?: number;
  };
  alternatives?: Array<{
    id: number;
    sku: string;
    nameUz: string;
    nameRu: string;
    price: number;
    manufacturer: string;
    isCheaper: boolean;
    priceDiff: number;
  }>;
}

export default function PrescriptionScreen() {
  const insets = useSafeAreaInsets();
  const { t, fmt, language, refresh } = useApp();

  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<MatchedItemState[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [customText, setCustomText] = useState('');
  const [addingToCart, setAddingToCart] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/catalog');
  };

  const processScan = async (payload: { text?: string; image?: string }) => {
    setScanning(true);
    setHasScanned(false);
    try {
      const res = await api.scanPrescription(payload);
      if (res && Array.isArray(res.items)) {
        const mapped: MatchedItemState[] = res.items.map((i) => ({
          ...i,
          selected: i.matchedProduct != null && i.confidence >= 60,
          quantity: 1,
        }));
        setItems(mapped);
        setHasScanned(true);
      } else {
        setItems([]);
        setHasScanned(true);
      }
    } catch {
      notify(t('catalog.prescriptionTitle'), t('catalog.prescriptionEmpty'));
      setItems([]);
      setHasScanned(true);
    } finally {
      setScanning(false);
    }
  };

  const handleCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify(t('catalog.prescriptionTitle'), t('catalog.prescriptionCamera'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const base64Data = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : 'demo_camera_scan';
        await processScan({ image: base64Data });
      }
    } catch {
      // Fallback to sample on simulator / unsupported web camera
      await handleDemoSample();
    }
  };

  const handleGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(t('catalog.prescriptionTitle'), t('catalog.prescriptionGallery'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const base64Data = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : 'demo_gallery_scan';
        await processScan({ image: base64Data });
      }
    } catch {
      await handleDemoSample();
    }
  };

  const handleDemoSample = async () => {
    const demoRx =
      'Rp: Tab. Paratsetamol 500 mg #10\nRp: Tab. Amoksitsillin 500 mg #20\nRp: Vitamin D3 2000 IU';
    setCustomText(demoRx);
    await processScan({ text: demoRx });
  };

  const toggleSelect = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)),
    );
  };

  const updateQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const nextQ = Math.max(1, Math.min(20, i.quantity + delta));
        return { ...i, quantity: nextQ };
      }),
    );
  };

  const selectAll = () => {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const selectedItems = items.filter((i) => i.selected && i.matchedProduct != null);
  const totalPrice = selectedItems.reduce(
    (sum, i) => sum + (i.matchedProduct?.price || 0) * i.quantity,
    0,
  );

  const handleAddAllToCart = async () => {
    if (selectedItems.length === 0 || addingToCart) return;
    setAddingToCart(true);
    try {
      for (const item of selectedItems) {
        if (item.matchedProduct) {
          await api.addToCart(item.matchedProduct.id, item.quantity);
        }
      }
      await refresh();
      notify(t('common.navCart'), t('catalog.addedToCartShort'));
      router.push('/cart');
    } catch {
      notify(t('common.navCart'), t('catalog.addToCartFailed'));
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('catalog.backToCatalog')}
        >
          <Feather name="arrow-left" size={22} color={PURPLE_DEEP} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('catalog.prescriptionTitle')}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {t('catalog.prescriptionSubtitle')}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* BANNER / ACTION CARDS */}
        <View style={styles.cardSection}>
          <View style={styles.bannerCard}>
            <View style={styles.bannerIconBox}>
              <MaterialCommunityIcons name="file-document-edit-outline" size={30} color={PURPLE} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.bannerTitle}>{t('catalog.prescriptionScanBannerTitle')}</Text>
              <Text style={styles.bannerSub}>{t('catalog.prescriptionScanBannerSub')}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleCamera}
              style={({ pressed }) => [styles.actionButton, styles.cameraButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('catalog.prescriptionCamera')}
            >
              <MaterialCommunityIcons name="camera-outline" size={22} color="#FFFFFF" />
              <Text style={styles.cameraBtnText}>{t('catalog.prescriptionCamera')}</Text>
            </Pressable>

            <Pressable
              onPress={handleGallery}
              style={({ pressed }) => [styles.actionButton, styles.galleryButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('catalog.prescriptionGallery')}
            >
              <MaterialCommunityIcons name="image-outline" size={22} color={PURPLE_DEEP} />
              <Text style={styles.galleryBtnText}>{t('catalog.prescriptionGallery')}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setTextInputVisible(!textInputVisible)}
            style={({ pressed }) => [styles.textToggleBtn, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="keyboard-outline" size={18} color={PURPLE} />
            <Text style={styles.textToggleText}>{t('catalog.prescriptionPasteText')}</Text>
            <Feather
              name={textInputVisible ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={PURPLE}
            />
          </Pressable>

          {textInputVisible ? (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={4}
                value={customText}
                onChangeText={setCustomText}
                placeholder={t('catalog.prescriptionInputPlaceholder')}
                placeholderTextColor={TEXT_MUTED}
              />
              <View style={styles.inputBtnRow}>
                <Pressable
                  onPress={handleDemoSample}
                  style={({ pressed }) => [styles.demoBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.demoBtnText}>{t('catalog.prescriptionSamplePrompt')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => processScan({ text: customText })}
                  style={({ pressed }) => [styles.scanSubmitBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.scanSubmitBtnText}>{t('catalog.prescriptionScanAction')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {/* LOADING INDICATOR */}
        {scanning ? (
          <View style={styles.scanningWrap}>
            <ActivityIndicator size="large" color={PURPLE} />
            <Text style={styles.scanningText}>{t('catalog.prescriptionScanning')}</Text>
          </View>
        ) : null}

        {/* RESULTS SECTION */}
        {hasScanned && !scanning ? (
          <View style={styles.resultsWrap}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {t('catalog.prescriptionResultsCount', { count: items.length })}
              </Text>
              <View style={styles.headerRightActions}>
                <Pressable
                  onPress={() => router.push('/reminders')}
                  hitSlop={8}
                  style={({ pressed }) => [styles.remindersLink, pressed && styles.pressed]}
                >
                  <Feather name="clock" size={13} color={PURPLE} />
                  <Text style={styles.remindersLinkText}>{t('reminders.quickActionReminders')}</Text>
                </Pressable>
                {items.length > 0 ? (
                  <Pressable onPress={selectAll} hitSlop={10}>
                    <Text style={styles.selectAllText}>{t('catalog.prescriptionSelectAll')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* DISCLAIMER */}
            <View style={styles.disclaimerBox}>
              <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#D97706" />
              <Text style={styles.disclaimerText}>{t('catalog.prescriptionDisclaimer')}</Text>
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="text-box-search-outline" size={48} color={TEXT_MUTED} />
                <Text style={styles.emptyText}>{t('catalog.prescriptionEmpty')}</Text>
              </View>
            ) : (
              items.map((item) => {
                const prod = item.matchedProduct;
                const name = prod ? localizedName(language, prod) : item.rawLine;
                const confColor =
                  item.confidenceLevel === 'high'
                    ? '#059669'
                    : item.confidenceLevel === 'medium'
                      ? '#D97706'
                      : '#DC2626';

                return (
                  <View key={item.id} style={styles.itemCard}>
                    {/* TOP: Checkbox + Drug Info */}
                    <View style={styles.itemTopRow}>
                      <Pressable
                        onPress={() => prod && toggleSelect(item.id)}
                        disabled={!prod}
                        style={styles.checkboxTouch}
                      >
                        <MaterialCommunityIcons
                          name={
                            item.selected
                              ? 'checkbox-marked-circle'
                              : 'checkbox-blank-circle-outline'
                          }
                          size={24}
                          color={item.selected ? PURPLE : BORDER}
                        />
                      </Pressable>

                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <View style={styles.badgeRow}>
                          <View
                            style={[
                              styles.confBadge,
                              { backgroundColor: `${confColor}18`, borderColor: `${confColor}40` },
                            ]}
                          >
                            <Text style={[styles.confText, { color: confColor }]}>
                              {t('catalog.prescriptionConfidence', { score: item.confidence })}
                            </Text>
                          </View>
                          {prod?.requiresPrescription ? (
                            <View style={styles.rxBadge}>
                              <Text style={styles.rxBadgeText}>{t('catalog.rxShort')}</Text>
                            </View>
                          ) : null}
                        </View>

                        <Text style={styles.productName} numberOfLines={2}>
                          {name}
                        </Text>
                        <Text style={styles.rawLineNote} numberOfLines={1}>
                          «{item.rawLine}»
                        </Text>
                      </View>
                    </View>

                    {/* BOTTOM: Price + Qty / Unavailable */}
                    {prod ? (
                      <View style={styles.itemBottomRow}>
                        <View>
                          <Text style={styles.priceText}>{fmt.money(prod.price)}</Text>
                          {prod.manufacturer ? (
                            <Text style={styles.manufacturerText}>{prod.manufacturer}</Text>
                          ) : null}
                        </View>

                        <View style={styles.qtyRow}>
                          <Pressable
                            onPress={() => updateQty(item.id, -1)}
                            style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={t('catalog.qtyDecreaseA11y')}
                          >
                            <Feather name="minus" size={16} color={PURPLE_DEEP} />
                          </Pressable>
                          <Text style={styles.qtyText}>{item.quantity}</Text>
                          <Pressable
                            onPress={() => updateQty(item.id, 1)}
                            style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={t('catalog.qtyIncreaseA11y')}
                          >
                            <Feather name="plus" size={16} color={PURPLE_DEEP} />
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

                    {/* ALTERNATIVE SUGGESTION */}
                    {item.alternatives && item.alternatives.length > 0 ? (
                      <View style={styles.analogChip}>
                        <MaterialCommunityIcons name="swap-horizontal" size={16} color={PURPLE} />
                        <Text style={styles.analogChipText} numberOfLines={1}>
                          {t('catalog.prescriptionCheaperAnalog', {
                            name: localizedName(language, item.alternatives[0]),
                            price: fmt.money(item.alternatives[0].price),
                          })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* STICKY BOTTOM BAR */}
      {selectedItems.length > 0 ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(14, insets.bottom) }]}>
          <View style={styles.bottomBarLeft}>
            <Text style={styles.bottomBarCount}>
              {t('catalog.prescriptionResultsCount', { count: selectedItems.length })}
            </Text>
            <Text style={styles.bottomBarTotal}>{fmt.money(totalPrice)}</Text>
          </View>

          <Pressable
            onPress={handleAddAllToCart}
            disabled={addingToCart}
            style={({ pressed }) => [styles.addAllBtn, pressed && styles.pressed]}
          >
            {addingToCart ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.addAllBtnText}>
                {t('catalog.prescriptionAddAllToCart', { total: fmt.money(totalPrice) })}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PURPLE_DEEP,
  },
  headerSub: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  scrollBody: {
    padding: 16,
  },
  cardSection: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PURPLE_DEEP,
  },
  bannerSub: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 6,
  },
  cameraButton: {
    backgroundColor: PURPLE,
  },
  cameraBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  galleryButton: {
    backgroundColor: '#EDE9FE',
  },
  galleryBtnText: {
    color: PURPLE_DEEP,
    fontWeight: '600',
    fontSize: 13,
  },
  textToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  textToggleText: {
    fontSize: 13,
    color: PURPLE,
    fontWeight: '600',
  },
  inputContainer: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingTop: 10,
  },
  textArea: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    fontSize: 14,
    color: PURPLE_DEEP,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  demoBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  demoBtnText: {
    fontSize: 12,
    color: PURPLE,
    fontWeight: '600',
  },
  scanSubmitBtn: {
    backgroundColor: PURPLE,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  scanSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  scanningWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  scanningText: {
    fontSize: 14,
    color: PURPLE,
    fontWeight: '600',
  },
  resultsWrap: {
    gap: 12,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  resultsCount: {
    fontSize: 16,
    fontWeight: '700',
    color: PURPLE_DEEP,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  remindersLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  remindersLinkText: {
    fontSize: 12,
    color: PURPLE,
    fontWeight: '600',
  },
  selectAllText: {
    fontSize: 13,
    color: PURPLE,
    fontWeight: '600',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxTouch: {
    paddingTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  confBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  confText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rxBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rxBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: PURPLE_DEEP,
    lineHeight: 20,
  },
  rawLineNote: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    color: PURPLE_DEEP,
  },
  manufacturerText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: PURPLE_DEEP,
  },
  analogChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  analogChipText: {
    fontSize: 12,
    color: PURPLE,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0px -2px 8px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 5,
      },
    }),
  },
  bottomBarLeft: {
    flex: 1,
  },
  bottomBarCount: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
  bottomBarTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: PURPLE_DEEP,
  },
  addAllBtn: {
    backgroundColor: PURPLE,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  addAllBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
