import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
const CAT_BG = '#EDE8F8';
const RED = '#FF3B30';
const YELLOW = '#FFCC00';

const priceUz = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} so'm`;

type CatId = string;

type SortKey = 'default' | 'price_asc' | 'price_desc' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Odatiy' },
  { key: 'price_asc', label: 'Narx: arzon' },
  { key: 'price_desc', label: 'Narx: qimmat' },
  { key: 'name', label: 'Nom: A–Z' },
];

type Product = {
  id: number | string;
  nameUz: string;
  manufacturer: string;
  category: string;
  price: number;
  icon: string;
  availableQuantity?: number | null;
  availabilityKnown?: boolean;
};

const PAGE_SIZE = 20;

function toast(title: string, msg: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

function ProductCard({
  item,
  list,
  liked,
  onOpen,
  onAdd,
  onToggleLike,
  adding,
}: {
  item: Product;
  list: boolean;
  liked: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onToggleLike: () => void;
  adding: boolean;
}) {
  return (
    <Pressable
      style={[styles.card, list && styles.cardList]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={item.nameUz}
    >
      <View style={[styles.cardImageWrap, list && styles.cardImageWrapList]}>
        <Pressable
          style={styles.heartBtn}
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleLike();
          }}
          accessibilityLabel={liked ? 'Sevimlidan olib tashlash' : 'Sevimlilarga'}
        >
          <MaterialCommunityIcons
            name={liked ? 'heart' : 'heart-outline'}
            size={18}
            color={liked ? RED : MUTED}
          />
        </Pressable>
        <MaterialCommunityIcons
          name={
            (item.icon in MaterialCommunityIcons.glyphMap
              ? item.icon
              : 'pill') as React.ComponentProps<typeof MaterialCommunityIcons>['name']
          }
          size={48}
          color={PURPLE}
        />
      </View>

      <View style={[styles.cardBody, list && styles.cardBodyList]}>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.nameUz}
        </Text>
        <Text style={styles.cardBrand} numberOfLines={1}>
          {item.manufacturer}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.priceCol}>
            <Text style={styles.cardPrice} numberOfLines={1}>
              {priceUz(item.price)}
            </Text>
            {item.availabilityKnown ? (
              <Text style={{ fontSize: 10, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                Filialda: {Math.max(0, Number(item.availableQuantity) || 0)}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={[styles.addBtn, adding && styles.addBtnBusy]}
            disabled={adding}
            onPress={(e) => {
              e.stopPropagation?.();
              onAdd();
            }}
            accessibilityLabel="Savatga qo‘shish"
          >
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="shopping-cart" size={15} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function Sheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {options.map((o) => {
            const active = o.key === selected;
            return (
              <Pressable
                key={o.key}
                style={[styles.sheetRow, active && styles.sheetRowActive]}
                onPress={() => {
                  onSelect(o.key);
                  onClose();
                }}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>{o.label}</Text>
                {active ? <Feather name="check" size={18} color={PURPLE} /> : null}
              </Pressable>
            );
          })}
          <Pressable style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Yopish</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ q?: string }>();
  const { refresh, cartCount } = useApp();

  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [cat, setCat] = useState<CatId>('all');
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<SortKey>('default');
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [apiProducts, setApiProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const loadGenRef = React.useRef(0);
  const nextOffsetRef = React.useRef(0);
  const hasMoreRef = React.useRef(false);
  const loadingMoreRef = React.useRef(false);

  const contentWidth = Math.min(width, 480);
  const gridGap = 12;
  const sidePad = 16;
  const cardWidth = (contentWidth - sidePad * 2 - gridGap) / 2;

  useEffect(() => {
    if (typeof params.q === 'string' && params.q) setQuery(params.q);
  }, [params.q]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void api.categories().then((data) => {
      setApiCategories(Array.isArray(data.categories) ? data.categories.filter(Boolean) : []);
    }).catch(() => setApiCategories([]));
  }, []);

  useEffect(() => {
    void api.cart().then((c) => {
      const id = c?.branch?.id ?? c?.cart?.branchId ?? null;
      setBranchId(id != null && Number.isFinite(Number(id)) ? Number(id) : null);
    }).catch(() => setBranchId(null));
  }, []);

  const buildQuery = useCallback((offset: number) => {
    const qs = new URLSearchParams();
    if (debouncedQuery) qs.set('q', debouncedQuery);
    if (cat && cat !== 'all') qs.set('category', cat);
    if (sort && sort !== 'default') qs.set('sort', sort);
    if (branchId) qs.set('branchId', String(branchId));
    qs.set('limit', String(PAGE_SIZE));
    qs.set('offset', String(offset));
    return `?${qs}`;
  }, [debouncedQuery, cat, sort, branchId]);

  const loadProducts = useCallback((mode: 'reset' | 'more' = 'reset') => {
    const gen = ++loadGenRef.current;
    const offset = mode === 'more' ? nextOffsetRef.current : 0;
    if (mode === 'reset') {
      setLoading(true);
      setLoadError(false);
      setPageError(false);
      hasMoreRef.current = false;
      nextOffsetRef.current = 0;
    } else {
      if (loadingMoreRef.current || !hasMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      setPageError(false);
    }
    void api
      .products(buildQuery(offset))
      .then((data) => {
        if (gen !== loadGenRef.current) return;
        const page = data.products || [];
        const more = Boolean(data.hasMore ?? data.pagination?.hasMore);
        const next = data.pagination?.nextOffset != null
          ? data.pagination.nextOffset
          : offset + page.length;
        nextOffsetRef.current = next;
        hasMoreRef.current = more;
        setHasMore(more);
        setTotal(Number(data.total ?? data.pagination?.total ?? page.length));
        setApiProducts((prev) => {
          if (mode === 'reset') return page;
          const seen = new Set(prev.map((p) => String(p.id)));
          const merged = [...prev];
          for (const p of page) {
            if (!seen.has(String(p.id))) merged.push(p);
          }
          return merged;
        });
        setLoadError(false);
      })
      .catch(() => {
        if (gen !== loadGenRef.current) return;
        if (mode === 'reset') {
          setApiProducts([]);
          setLoadError(true);
          hasMoreRef.current = false;
          setHasMore(false);
        } else {
          setPageError(true);
        }
      })
      .finally(() => {
        if (gen !== loadGenRef.current) return;
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      });
  }, [buildQuery]);

  useEffect(() => {
    nextOffsetRef.current = 0;
    loadProducts('reset');
    return () => {
      loadGenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when filters change
  }, [debouncedQuery, cat, sort, branchId]);

  const allProducts = useMemo((): Product[] => {
    return apiProducts.map((p) => ({
      id: p.id,
      nameUz: String(p.nameUz || p.nameRu || ''),
      manufacturer: String(p.manufacturer || ''),
      category: String(p.category || ''),
      price: Number(p.price || 0),
      icon: String(p.icon || 'pill'),
      availableQuantity: p.availableQuantity != null ? Number(p.availableQuantity) : null,
      availabilityKnown: Boolean(p.availabilityKnown),
    }));
  }, [apiProducts]);

  const products = allProducts;

  const categoryChips = useMemo(
    () => [{ id: 'all', label: 'Barchasi' }, ...apiCategories.map((c) => ({ id: c, label: c }))],
    [apiCategories],
  );

  const hasActiveSearch = Boolean(debouncedQuery) || (cat !== 'all');
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sort)?.label || 'Saralash';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const openProduct = useCallback((p: Product) => {
    if (typeof p.id === 'number' || /^\d+$/.test(String(p.id))) {
      router.push(`/product/${p.id}`);
      return;
    }
    toast(p.nameUz, `${p.manufacturer}\n${priceUz(p.price)}`);
  }, []);

  const addToCart = useCallback(
    async (p: Product) => {
      const key = String(p.id);
      if (!/^\d+$/.test(key) && typeof p.id !== 'number') {
        toast('Savat', 'Mahsulotni savatga qo‘shish uchun tizimga kiring yoki API ishlashi kerak.');
        return;
      }
      setAddingId(key);
      try {
        await api.addToCart(Number(p.id));
        await refresh();
        toast('Savat', `${p.nameUz} qo‘shildi`);
      } catch (e) {
        toast('Xatolik', e instanceof Error ? e.message : 'Savatga qo‘shilmadi');
      } finally {
        setAddingId(null);
      }
    },
    [refresh],
  );

  const toggleLike = (p: Product) => {
    const key = String(p.id);
    setLiked((prev) => {
      const next = !prev[key];
      toast(next ? 'Sevimlilar' : 'Olib tashlandi', p.nameUz);
      return { ...prev, [key]: next };
    });
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { width: contentWidth, paddingBottom: 32 + (Platform.OS === 'web' ? 20 : 8) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 160;
          if (nearBottom && hasMore && !loading && !loadingMore) {
            loadProducts('more');
          }
        }}
        scrollEventThrottle={200}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel="Orqaga">
            <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              Katalog
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              Kerakli dori — bir zumda
            </Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => router.push('/cart')} accessibilityLabel="Savat">
            <Feather name="shopping-cart" size={18} color={PURPLE_DEEP} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : String(cartCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={PURPLE_DEEP} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Dori yoki mahsulot qidirish..."
            placeholderTextColor="#A8B0C0"
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Tozalash">
              <Feather name="x" size={18} color={MUTED} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push('/qr')} hitSlop={6} accessibilityLabel="Mening QR kodim">
            <MaterialCommunityIcons name="line-scan" size={22} color={PURPLE_DEEP} />
          </Pressable>
        </View>

        {/* Categories — from API */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catsRow}
          style={styles.catsScroll}
        >
          {categoryChips.map((c) => {
            const active = cat === c.id;
            return (
              <Pressable key={c.id} style={styles.catItem} onPress={() => setCat(c.id)}>
                <View style={[styles.catIcon, active && styles.catIconActive]}>
                  <MaterialCommunityIcons
                    name={c.id === 'all' ? 'view-grid' : 'tag-outline'}
                    size={22}
                    color={active ? '#fff' : PURPLE}
                  />
                </View>
                <Text style={[styles.catLabel, active && styles.catLabelActive]} numberOfLines={2}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Tools */}
        <View style={styles.toolsRow}>
          <Pressable style={styles.toolChip} onPress={() => setSortOpen(true)}>
            <MaterialCommunityIcons name="swap-vertical" size={16} color={PURPLE_DEEP} />
            <Text style={styles.toolText} numberOfLines={1}>
              {sort === 'default' ? 'Saralash' : sortLabel}
            </Text>
            <Feather name="chevron-down" size={14} color={MUTED} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 4 }} />
          <View style={styles.viewToggle}>
            <Pressable
              style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnActive]}
              onPress={() => setViewMode('grid')}
              accessibilityLabel="Katak ko‘rinish"
            >
              <MaterialCommunityIcons name="view-grid" size={16} color={viewMode === 'grid' ? '#fff' : PURPLE_DEEP} />
            </Pressable>
            <Pressable
              style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
              onPress={() => setViewMode('list')}
              accessibilityLabel="Ro‘yxat ko‘rinish"
            >
              <MaterialCommunityIcons
                name="format-list-bulleted"
                size={16}
                color={viewMode === 'list' ? '#fff' : PURPLE_DEEP}
              />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={PURPLE} />
            <Text style={styles.emptyText}>Yuklanmoqda...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="cloud-off-outline" size={40} color={MUTED} />
            <Text style={styles.emptyTitle}>Mahsulotlarni yuklab bo‘lmadi</Text>
            <Text style={styles.emptyText}>
              {query.trim()
                ? `Qidiruv saqlanadi: «${query.trim()}». Qayta urinib ko‘ring.`
                : 'Internet aloqasini tekshiring va qayta urinib ko‘ring'}
            </Text>
            <Pressable style={styles.resetBtn} onPress={() => loadProducts('reset')}>
              <Text style={styles.resetBtnText}>Qayta urinish</Text>
            </Pressable>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="package-variant" size={40} color={MUTED} />
            <Text style={styles.emptyTitle}>
              {hasActiveSearch ? 'Mahsulot topilmadi' : 'Mahsulotlar topilmadi'}
            </Text>
            <Text style={styles.emptyText}>
              {hasActiveSearch
                ? debouncedQuery
                  ? `«${debouncedQuery}» bo‘yicha natija yo‘q. Boshqa kategoriya yoki qidiruvni sinab ko‘ring.`
                  : 'Tanlangan kategoriya bo‘yicha mahsulot yo‘q.'
                : 'Katalog hozircha bo‘sh. Keyinroq qayta urinib ko‘ring.'}
            </Text>
            {hasActiveSearch ? (
              <Pressable
                style={styles.resetBtn}
                onPress={() => {
                  setQuery('');
                  setCat('all');
                  setSort('default');
                }}
              >
                <Text style={styles.resetBtnText}>Filtrlarni tozalash</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.resetBtn} onPress={() => loadProducts('reset')}>
                <Text style={styles.resetBtnText}>Qayta urinish</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={[styles.grid, viewMode === 'list' && styles.list]}>
            {!branchId ? (
              <Text style={{ width: '100%', color: MUTED, fontSize: 11, marginBottom: 8 }}>
                Filial tanlanmagan — qoldiq ko‘rsatilmaydi (savat/checkoutda tanlang)
              </Text>
            ) : (
              <Text style={{ width: '100%', color: MUTED, fontSize: 11, marginBottom: 8 }}>
                Mavjudlik savat filialiga bog‘langan · jami: {total}
              </Text>
            )}
            {products.map((p) => (
              <View
                key={String(p.id)}
                style={
                  viewMode === 'grid'
                    ? [styles.gridItem, { width: cardWidth }]
                    : styles.listItem
                }
              >
                <ProductCard
                  item={p}
                  list={viewMode === 'list'}
                  liked={!!liked[String(p.id)]}
                  adding={addingId === String(p.id)}
                  onOpen={() => openProduct(p)}
                  onAdd={() => void addToCart(p)}
                  onToggleLike={() => toggleLike(p)}
                />
              </View>
            ))}
            {loadingMore ? (
              <View style={{ width: '100%', paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color={PURPLE} />
              </View>
            ) : null}
            {pageError ? (
              <Pressable
                style={[styles.resetBtn, { width: '100%', marginTop: 8 }]}
                onPress={() => loadProducts('more')}
              >
                <Text style={styles.resetBtnText}>Keyingi sahifani qayta yuklash</Text>
              </Pressable>
            ) : null}
            {!hasMore && products.length > 0 ? (
              <Text style={{ width: '100%', textAlign: 'center', color: MUTED, fontSize: 12, marginTop: 12 }}>
                Ro‘yxat tugadi
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Sheet
        visible={sortOpen}
        title="Saralash"
        options={SORT_OPTIONS}
        selected={sort}
        onSelect={(k) => setSort(k as SortKey)}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: {
    paddingHorizontal: 16,
    alignSelf: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A1040',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'visible',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
    includeFontPadding: false,
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: BG,
  },
  cartBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: PURPLE_DEEP,
    includeFontPadding: false,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    shadowColor: '#1A1040',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: PURPLE_DEEP,
    padding: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },

  catsScroll: { marginBottom: 12, marginHorizontal: -16, flexGrow: 0 },
  catsRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  catItem: { width: 76, alignItems: 'center' },
  catIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: CAT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  catIconActive: { backgroundColor: PURPLE },
  catLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 13,
    height: 26,
    color: PURPLE_DEEP,
    textAlign: 'center',
    includeFontPadding: false,
  },
  catLabelActive: {
    fontFamily: 'Inter_600SemiBold',
    color: PURPLE,
  },

  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'nowrap',
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CARD,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '42%',
    flexShrink: 1,
  },
  toolChipActive: { backgroundColor: PURPLE },
  toolText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: PURPLE_DEEP,
    flexShrink: 1,
  },
  toolTextActive: { color: '#fff' },
  viewToggle: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  viewBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnActive: { backgroundColor: PURPLE },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  list: { flexDirection: 'column', rowGap: 12 },
  gridItem: {},
  listItem: { width: '100%' },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 12,
    shadowColor: '#1A1040',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    width: '100%',
  },
  cardList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardImageWrap: {
    height: 118,
    borderRadius: 12,
    backgroundColor: '#FAFAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardImageWrapList: {
    width: 100,
    height: 100,
    marginBottom: 0,
    flexShrink: 0,
  },
  cardImage: { width: '88%', height: '88%' },
  discountBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    zIndex: 2,
    backgroundColor: RED,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  discountText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#fff',
    includeFontPadding: false,
  },
  heartBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  cardBody: { minWidth: 0 },
  cardBodyList: { flex: 1, minWidth: 0 },
  cardName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    lineHeight: 17,
    color: PURPLE_DEEP,
    minHeight: 34,
    includeFontPadding: false,
  },
  cardBrand: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
    includeFontPadding: false,
  },
  cardFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  priceCol: { flex: 1, minWidth: 0, paddingRight: 4 },
  cardPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE,
    includeFontPadding: false,
  },
  cardOld: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
    textDecorationLine: 'line-through',
    includeFontPadding: false,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addBtnBusy: { opacity: 0.75 },

  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
    marginTop: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: 12,
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resetBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#fff',
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,10,40,0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 4,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
    marginBottom: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  sheetRowActive: { backgroundColor: CAT_BG },
  sheetRowText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: PURPLE_DEEP,
  },
  sheetRowTextActive: {
    fontFamily: 'Inter_700Bold',
    color: PURPLE,
  },
  sheetCancel: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: MUTED,
  },
});
