import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F5F4FA';
const CARD = '#FFFFFF';
const BORDER = '#E8E4F2';
const LAVENDER = '#F6F2FC';
const YELLOW = '#FFCC00';
const OK = '#3D7A55';
const BAD = '#B91C1C';

const priceUz = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

function toast(title: string, msg: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

type BranchMeta = {
  id: number | null;
  name: string | null;
  address: string | null;
};

type StockUi =
  | { kind: 'no_branch' }
  | { kind: 'available'; qty: number }
  | { kind: 'unavailable' };

function resolveStock(data: {
  availabilityScoped?: boolean;
  selectedBranchId?: number | null;
  availableQuantity?: number | null;
}): StockUi {
  const scoped = Boolean(data.availabilityScoped) && data.selectedBranchId != null;
  if (!scoped) return { kind: 'no_branch' };
  const qty = Math.max(0, Number(data.availableQuantity) || 0);
  if (qty > 0) return { kind: 'available', qty };
  return { kind: 'unavailable' };
}

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.skel, style]} />;
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { refresh, cartCount } = useApp();
  const narrow = width < 380;
  const contentWidth = Math.min(width, 480);

  const [data, setData] = useState<any>(null);
  const [branchMeta, setBranchMeta] = useState<BranchMeta>({ id: null, name: null, address: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const [qty, setQty] = useState(1);

  const loadGen = useRef(0);
  const addingLock = useRef(false);
  const dataRef = useRef<any>(null);
  const branchIdRef = useRef<number | null>(null);
  const productKeyRef = useRef<string>('');

  dataRef.current = data;

  const load = useCallback(async (force = false) => {
    const productId = Number(id);
    const productKey = String(id ?? '');
    if (!Number.isInteger(productId) || productId <= 0) {
      setData(null);
      setError('Mahsulot topilmadi');
      setNotFound(true);
      setLoading(false);
      return;
    }

    const gen = ++loadGen.current;

    let branchId: number | null = null;
    let name: string | null = null;
    let address: string | null = null;
    try {
      const cart = await api.cart();
      if (gen !== loadGen.current) return;
      const raw = cart?.branch?.id ?? cart?.cart?.branchId;
      if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) {
        branchId = Number(raw);
      }
      if (cart?.branch) {
        name = cart.branch.name != null ? String(cart.branch.name) : null;
        address = cart.branch.address != null ? String(cart.branch.address) : null;
      }
    } catch {
      // cart optional for browse
    }

    if (gen !== loadGen.current) return;
    setBranchMeta({ id: branchId, name, address });

    const sameProduct = productKeyRef.current === productKey && dataRef.current?.product?.id === productId;
    const sameBranch = branchIdRef.current === branchId;
    if (!force && sameProduct && sameBranch && dataRef.current?.product) {
      setLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    const showSkeleton = !dataRef.current?.product || productKeyRef.current !== productKey;
    if (showSkeleton) setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await api.product(productId, branchId ? { branchId } : undefined);
      if (gen !== loadGen.current) return;
      productKeyRef.current = productKey;
      branchIdRef.current = branchId;
      setData(res);
      setError(null);
      setNotFound(false);
    } catch (err: any) {
      if (gen !== loadGen.current) return;
      setData(null);
      productKeyRef.current = '';
      const is404 = err?.status === 404 || err?.code === 'PRODUCT_NOT_FOUND';
      setNotFound(is404);
      setError(is404 ? 'Mahsulot topilmadi' : err?.message || 'Mahsulotni yuklab bo‘lmadi');
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
      return () => {
        loadGen.current += 1;
      };
    }, [load]),
  );

  const product = data?.product;
  const stock = useMemo(() => (data ? resolveStock(data) : { kind: 'no_branch' as const }), [data]);
  const canAdd = stock.kind !== 'unavailable';
  const maxQty = stock.kind === 'available' ? stock.qty : null;

  useEffect(() => {
    setQty(1);
  }, [product?.id]);

  useEffect(() => {
    if (maxQty != null && qty > maxQty) {
      setQty(Math.max(1, maxQty));
    }
  }, [maxQty, qty]);

  const analogs = useMemo(() => {
    if (!product || !Array.isArray(data?.analogs)) return [];
    return data.analogs.filter((item: any) => item?.id != null && item.id !== product.id);
  }, [data?.analogs, product]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/catalog');
  };

  const onDec = () => setQty((q) => Math.max(1, q - 1));
  const onInc = () =>
    setQty((q) => {
      if (maxQty != null) return Math.min(maxQty, q + 1);
      return q + 1;
    });

  const onAdd = async () => {
    if (!product || !canAdd || adding || addingLock.current) return;
    const productId = Number(product.id);
    if (!Number.isInteger(productId) || productId <= 0) return;
    const amount = Math.max(1, qty);
    if (maxQty != null && amount > maxQty) {
      toast('Savat', 'Filialdagi mavjud miqdordan oshib ketdi.');
      return;
    }
    addingLock.current = true;
    setAdding(true);
    try {
      await api.addToCart(productId, amount);
      await refresh();
      toast('Savat', `${product.nameUz} qo‘shildi`);
      router.push('/cart');
    } catch (err) {
      toast('Xatolik', err instanceof Error ? err.message : 'Savatga qo‘shilmadi');
    } finally {
      addingLock.current = false;
      setAdding(false);
    }
  };

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 12) : Math.max(insets.top, 8);
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12);
  const sidePad = narrow ? 14 : 20;
  const footerReserve = 24 + 72 + bottomPad;

  const iconName =
    product?.icon && product.icon in MaterialCommunityIcons.glyphMap
      ? product.icon
      : 'pill';

  const header = (
    <View style={[styles.header, { paddingHorizontal: sidePad, paddingTop: topPad }]}>
      <Pressable
        style={styles.iconBtn}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Orqaga"
      >
        <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        Mahsulot
      </Text>
      <Pressable
        style={styles.iconBtn}
        onPress={() => router.push('/cart')}
        accessibilityRole="button"
        accessibilityLabel="Savat"
      >
        <Feather name="shopping-cart" size={18} color={PURPLE_DEEP} />
        {cartCount > 0 ? (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : String(cartCount)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  if (loading && !product) {
    return (
      <View style={styles.root}>
        {header}
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { width: contentWidth, paddingHorizontal: sidePad, paddingBottom: 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonBlock style={styles.skelVisual} />
          <SkeletonBlock style={[styles.skelLine, { width: '78%', height: 24, marginTop: 16 }]} />
          <SkeletonBlock style={[styles.skelLine, { width: '40%', height: 14, marginTop: 10 }]} />
          <SkeletonBlock style={[styles.skelLine, { width: '34%', height: 28, marginTop: 14 }]} />
          <SkeletonBlock style={[styles.skelLine, { width: '100%', height: 72, marginTop: 14, borderRadius: 16 }]} />
        </ScrollView>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.state}>
          <MaterialCommunityIcons
            name={notFound ? 'package-variant-closed' : 'cloud-off-outline'}
            size={44}
            color={MUTED}
          />
          <Text style={styles.stateTitle}>{error || 'Mahsulot topilmadi'}</Text>
          {notFound ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.replace({ pathname: '/(tabs)/catalog', params: { q: '' } } as any)}
              accessibilityRole="button"
              accessibilityLabel="Katalogga qaytish"
            >
              <Text style={styles.primaryBtnText}>Katalogga qaytish</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => void load(true)}
              accessibilityRole="button"
              accessibilityLabel="Qayta urinish"
            >
              <Text style={styles.primaryBtnText}>Qayta urinish</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const description = String(product.description || '').trim();
  const manufacturer = String(product.manufacturer || '').trim();
  const category = String(product.category || '').trim();
  const unit = String(product.unit || '').trim();
  const metaBits = [category, unit || null].filter(Boolean) as string[];

  return (
    <View style={styles.root}>
      {header}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            width: contentWidth,
            paddingHorizontal: sidePad,
            paddingBottom: footerReserve,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[styles.visual, narrow && styles.visualNarrow]}
          accessibilityRole="image"
          accessibilityLabel={`${product.nameUz} ikonkasi`}
        >
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons
              name={iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
              size={narrow ? 56 : 64}
              color={PURPLE}
            />
          </View>
        </View>

        <Text style={[styles.name, narrow && styles.nameNarrow]}>{product.nameUz}</Text>

        {manufacturer ? <Text style={styles.manufacturer}>{manufacturer}</Text> : null}

        {metaBits.length ? (
          <Text style={styles.metaLine} numberOfLines={2}>
            {metaBits.join(' · ')}
          </Text>
        ) : null}

        <Text style={styles.price}>{priceUz(Number(product.price) || 0)}</Text>

        {product.requiresPrescription ? (
          <View style={styles.rxBadge}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={PURPLE} />
            <Text style={styles.rxBadgeText}>Retsept talab qilinadi</Text>
          </View>
        ) : null}

        <View style={styles.stockCard}>
          {stock.kind === 'no_branch' ? (
            <>
              <Text style={styles.stockLabel}>Filial tanlanmagan</Text>
              <Text style={styles.stockHint}>
                Qoldiqni ko‘rish uchun filialni tanlang. Filial tanlanmaguncha mavjudlik ko‘rsatilmaydi.
              </Text>
              <Pressable
                style={styles.branchBtn}
                onPress={() =>
                  router.push({
                    pathname: '/branches',
                    params: { from: 'product', productId: String(id) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Filial tanlash — qoldiqni ko‘rish uchun"
              >
                <Feather name="map-pin" size={14} color={PURPLE} />
                <Text style={styles.branchBtnText}>Filial tanlash</Text>
              </Pressable>
            </>
          ) : (
            <>
              {branchMeta.name ? (
                <Text style={styles.branchName} numberOfLines={2}>
                  {branchMeta.name}
                </Text>
              ) : null}
              {branchMeta.address ? (
                <Text style={styles.branchAddress} numberOfLines={2}>
                  {branchMeta.address}
                </Text>
              ) : null}
              {stock.kind === 'available' ? (
                <>
                  <Text style={[styles.stockLabel, styles.stockOk, branchMeta.name ? { marginTop: 8 } : null]}>
                    Mavjud
                  </Text>
                  <Text style={styles.stockHint}>{stock.qty} dona</Text>
                </>
              ) : (
                <Text style={[styles.stockLabel, styles.stockBad, branchMeta.name ? { marginTop: 8 } : null]}>
                  Mavjud emas
                </Text>
              )}
              <Pressable
                style={styles.branchBtnGhost}
                onPress={() =>
                  router.push({
                    pathname: '/branches',
                    params: { from: 'product', productId: String(id) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Filialni o‘zgartirish"
              >
                <Text style={styles.branchBtnGhostText}>Filialni o‘zgartirish</Text>
              </Pressable>
            </>
          )}
        </View>

        {description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mahsulot haqida</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
        ) : null}

        {analogs.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>O‘xshash mahsulotlar</Text>
            {analogs.map((item: any) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/product/${item.id}`)}
                style={styles.analogRow}
                accessibilityRole="button"
                accessibilityLabel={String(item.nameUz || '')}
              >
                <View style={styles.analogIcon}>
                  <MaterialCommunityIcons
                    name={
                      (item.icon && item.icon in MaterialCommunityIcons.glyphMap
                        ? item.icon
                        : 'pill') as React.ComponentProps<typeof MaterialCommunityIcons>['name']
                    }
                    size={22}
                    color={PURPLE}
                  />
                </View>
                <View style={styles.analogBody}>
                  <Text style={styles.analogName} numberOfLines={2}>
                    {item.nameUz}
                  </Text>
                  {item.manufacturer ? (
                    <Text style={styles.analogMeta} numberOfLines={1}>
                      {item.manufacturer}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.analogPrice}>{priceUz(Number(item.price) || 0)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad, paddingHorizontal: sidePad }]}>
        <View style={[styles.footerInner, { maxWidth: contentWidth - sidePad * 2, width: '100%' }]}>
          {canAdd ? (
            <View style={styles.qtyWrap}>
              <Pressable
                style={[styles.qtyBtn, qty <= 1 && styles.qtyBtnDisabled]}
                onPress={onDec}
                disabled={qty <= 1 || adding}
                accessibilityRole="button"
                accessibilityLabel="Miqdorni kamaytirish"
              >
                <Feather name="minus" size={16} color={PURPLE_DEEP} />
              </Pressable>
              <Text style={styles.qtyValue} accessibilityLabel={`Miqdor ${qty}`}>
                {qty}
              </Text>
              <Pressable
                style={[
                  styles.qtyBtn,
                  maxQty != null && qty >= maxQty && styles.qtyBtnDisabled,
                ]}
                onPress={onInc}
                disabled={adding || (maxQty != null && qty >= maxQty)}
                accessibilityRole="button"
                accessibilityLabel="Miqdorni oshirish"
              >
                <Feather name="plus" size={16} color={PURPLE_DEEP} />
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={[styles.cta, (!canAdd || adding) && styles.ctaDisabled]}
            onPress={() => void onAdd()}
            disabled={!canAdd || adding}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdd || adding }}
            accessibilityLabel={canAdd ? 'Savatga qo‘shish' : 'Mavjud emas'}
          >
            {adding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="shopping-cart" size={16} color="#fff" />
                <Text style={styles.ctaText} numberOfLines={1}>
                  {canAdd ? 'Savatga qo‘shish' : 'Mavjud emas'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
  },
  scroll: { flex: 1, width: '100%' },
  content: {
    alignSelf: 'center',
    paddingTop: 12,
  },

  header: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: CARD,
  },
  cartBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },

  visual: {
    height: 168,
    borderRadius: 22,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  visualNarrow: {
    height: 148,
  },
  iconBubble: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },

  name: {
    marginTop: 16,
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 30,
    color: PURPLE_DEEP,
  },
  nameNarrow: {
    fontSize: 22,
    lineHeight: 28,
  },
  manufacturer: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: MUTED,
  },
  metaLine: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
  },
  price: {
    marginTop: 12,
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: PURPLE,
  },
  rxBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3EAFB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCCEF2',
  },
  rxBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE,
  },

  stockCard: {
    marginTop: 16,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  branchName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  branchAddress: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: MUTED,
  },
  stockLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  stockOk: { color: OK },
  stockBad: { color: BAD },
  stockHint: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },
  branchBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LAVENDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  branchBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },
  branchBtnGhost: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  branchBtnGhostText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE,
  },

  section: { marginTop: 22 },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    marginBottom: 8,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
    color: '#4A5160',
  },

  analogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  analogIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analogBody: { flex: 1, minWidth: 0 },
  analogName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  analogMeta: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  analogPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE,
    flexShrink: 0,
    maxWidth: '34%',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CARD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    alignItems: 'center',
    paddingTop: 12,
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LAVENDER,
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  cta: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  ctaDisabled: { backgroundColor: '#C4B5D8' },
  ctaText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },

  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  stateTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 12,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },

  skel: {
    backgroundColor: '#E6E1F2',
    borderRadius: 10,
  },
  skelVisual: {
    height: 168,
    borderRadius: 22,
    width: '100%',
  },
  skelLine: {
    height: 16,
    borderRadius: 8,
  },
});
