import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const YELLOW = '#FFCC00';
const BAD_RED = '#B91C1C';

const priceUz = (n: number) =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

type CatId = string;
type SortKey = 'default' | 'price_asc' | 'price_desc' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Odatiy' },
  { key: 'price_asc', label: 'Narx: arzon' },
  { key: 'price_desc', label: 'Narx: qimmat' },
  { key: 'name', label: 'Nom: A–Z' },
];

/** Real list fields from GET /api/catalog/products (+ branch stock when scoped). */
type Product = {
  id: number | string;
  nameUz: string;
  manufacturer: string;
  category: string;
  price: number;
  icon: string;
  unit?: string;
  requiresPrescription?: boolean;
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

function routeQueryValue(params: { q?: string | string[] }): string {
  if (typeof params.q === 'string') return params.q;
  if (Array.isArray(params.q) && typeof params.q[0] === 'string') return params.q[0];
  return '';
}

/** Honest stock copy — never invents availability. */
function stockPresentation(
  item: Product,
  hasBranch: boolean,
): { text: string; tone: 'ok' | 'bad' | 'neutral'; canAdd: boolean } {
  if (!hasBranch) {
    return { text: 'Filial tanlanmagan', tone: 'neutral', canAdd: true };
  }
  if (!item.availabilityKnown) {
    return { text: 'Mavjudlik tekshirilmoqda', tone: 'neutral', canAdd: true };
  }
  const qty = Math.max(0, Number(item.availableQuantity) || 0);
  if (qty > 0) {
    return { text: 'Filialda mavjud', tone: 'ok', canAdd: true };
  }
  return { text: 'Filialda mavjud emas', tone: 'bad', canAdd: false };
}

function productIconName(icon: string) {
  return (
    icon in MaterialCommunityIcons.glyphMap ? icon : 'pill'
  ) as React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

function ProductCard({
  item,
  list,
  hasBranch,
  onOpen,
  onAdd,
  adding,
}: {
  item: Product;
  list: boolean;
  hasBranch: boolean;
  onOpen: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const stock = stockPresentation(item, hasBranch);
  const addDisabled = adding || !stock.canAdd;
  const showRx = Boolean(item.requiresPrescription);

  if (list) {
    return (
      <View style={styles.cardList}>
        <Pressable
          style={styles.cardListMain}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={item.nameUz}
        >
          <View style={styles.cardImageWrapList}>
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons name={productIconName(item.icon)} size={28} color={PURPLE} />
            </View>
          </View>
          <View style={styles.cardBodyList}>
            <View style={styles.listTopRow}>
              <Text style={styles.cardNameList} numberOfLines={2}>
                {item.nameUz}
              </Text>
              {showRx ? (
                <View style={styles.rxChip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Text style={styles.rxChipText}>Rx</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.manufacturer}
            </Text>
            <Text
              style={[
                styles.stockText,
                stock.tone === 'ok' && styles.stockOk,
                stock.tone === 'bad' && styles.stockBad,
              ]}
              numberOfLines={1}
            >
              {stock.text}
            </Text>
          </View>
        </Pressable>
        <View style={styles.cardFooterList}>
          <Pressable
            style={styles.priceCol}
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${item.nameUz}, ${priceUz(item.price)}`}
          >
            <Text style={styles.cardPrice} numberOfLines={1}>
              {priceUz(item.price)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.addBtn, addDisabled && styles.addBtnDisabled, adding && styles.addBtnBusy]}
            disabled={addDisabled}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityState={{ disabled: addDisabled }}
            accessibilityLabel={
              stock.canAdd ? 'Savatga qo‘shish' : 'Filialda mavjud emas — savatga qo‘shib bo‘lmaydi'
            }
          >
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="shopping-cart" size={16} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardMain}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={item.nameUz}
      >
        <View style={styles.cardMedia}>
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons name={productIconName(item.icon)} size={44} color={PURPLE} />
          </View>
          {showRx ? (
            <View style={styles.rxCorner} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.rxChipText}>Rx</Text>
            </View>
          ) : (
            <View style={styles.mediaAccent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>
            {item.nameUz}
          </Text>
          <Text style={styles.cardBrand} numberOfLines={1}>
            {item.manufacturer}
          </Text>

          <View style={styles.cardSpacer} />

          <Text
            style={[
              styles.stockText,
              stock.tone === 'ok' && styles.stockOk,
              stock.tone === 'bad' && styles.stockBad,
            ]}
            numberOfLines={1}
          >
            {stock.text}
          </Text>
        </View>
      </Pressable>

      <View style={styles.cardFooter}>
        <Pressable
          style={styles.priceCol}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${item.nameUz}, ${priceUz(item.price)}`}
        >
          <Text style={styles.cardPrice} numberOfLines={1}>
            {priceUz(item.price)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.addBtn, addDisabled && styles.addBtnDisabled, adding && styles.addBtnBusy]}
          disabled={addDisabled}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityState={{ disabled: addDisabled }}
          accessibilityLabel={
            stock.canAdd ? 'Savatga qo‘shish' : 'Filialda mavjud emas — savatga qo‘shib bo‘lmaydi'
          }
        >
          {adding ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="shopping-cart" size={16} color="#fff" />
          )}
        </Pressable>
      </View>
    </View>
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
      <View style={styles.sheetBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Yopish"
        />
        <View style={styles.sheetCard}>
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
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>{o.label}</Text>
                {active ? <Feather name="check" size={18} color={PURPLE} /> : null}
              </Pressable>
            );
          })}
          <Pressable style={styles.sheetCancel} onPress={onClose} accessibilityRole="button" accessibilityLabel="Yopish">
            <Text style={styles.sheetCancelText}>Yopish</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const { refresh, cartCount } = useApp();
  const narrow = width < 380;

  const initialQ = routeQueryValue(params);
  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ.trim());
  const [cat, setCat] = useState<CatId>('all');
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [catError, setCatError] = useState(false);
  const [catLoading, setCatLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<SortKey>('default');
  const [apiProducts, setApiProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  /** Branch context comes from cart API (`cart.branchId` / `branch.id`) — no second store. */
  const [branchId, setBranchId] = useState<number | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const loadGenRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  /** Prevents route→local echo loops when we push q via setParams. */
  const lastSyncedRouteQ = useRef<string>(initialQ);

  const contentWidth = Math.min(width, 480);
  const gridGap = narrow ? 10 : 12;
  const sidePad = narrow ? 12 : 16;
  const cardWidth = (contentWidth - sidePad * 2 - gridGap) / 2;

  const syncQueryToRoute = useCallback((raw: string) => {
    const next = raw.trim();
    lastSyncedRouteQ.current = next;
    router.setParams({ q: next } as any);
  }, []);

  // External navigation (Home search / clear) → local search field
  useEffect(() => {
    const routeQ = routeQueryValue(params);
    if (routeQ !== lastSyncedRouteQ.current) {
      lastSyncedRouteQ.current = routeQ;
      setQuery(routeQ);
      setDebouncedQuery(routeQ.trim());
    }
  }, [params]);

  // Debounce typing → products + route params
  useEffect(() => {
    const t = setTimeout(() => {
      const q = query.trim();
      setDebouncedQuery(q);
      if (q !== lastSyncedRouteQ.current) {
        syncQueryToRoute(q);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, syncQueryToRoute]);

  const loadCategories = useCallback(() => {
    setCatLoading(true);
    setCatError(false);
    void api
      .categories()
      .then((data) => {
        setApiCategories(Array.isArray(data.categories) ? data.categories.filter(Boolean) : []);
        setCatError(false);
      })
      .catch(() => {
        setApiCategories([]);
        setCatError(true);
      })
      .finally(() => setCatLoading(false));
  }, []);

  const refreshBranchFromCart = useCallback(async () => {
    try {
      const c = await api.cart();
      const id = c?.branch?.id ?? c?.cart?.branchId ?? null;
      const next = id != null && Number.isFinite(Number(id)) ? Number(id) : null;
      setBranchId((prev) => (prev === next ? prev : next));
    } catch {
      setBranchId(null);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useFocusEffect(
    useCallback(() => {
      void refreshBranchFromCart();
    }, [refreshBranchFromCart]),
  );

  const buildQuery = useCallback(
    (offset: number) => {
      const qs = new URLSearchParams();
      if (debouncedQuery) qs.set('q', debouncedQuery);
      if (cat && cat !== 'all') qs.set('category', cat);
      if (sort && sort !== 'default') qs.set('sort', sort);
      if (branchId) qs.set('branchId', String(branchId));
      qs.set('limit', String(PAGE_SIZE));
      qs.set('offset', String(offset));
      return `?${qs}`;
    },
    [debouncedQuery, cat, sort, branchId],
  );

  const loadProducts = useCallback(
    (mode: 'reset' | 'more' = 'reset') => {
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
          const next =
            data.pagination?.nextOffset != null ? data.pagination.nextOffset : offset + page.length;
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
    },
    [buildQuery],
  );

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
      unit: p.unit != null ? String(p.unit) : undefined,
      requiresPrescription: Boolean(p.requiresPrescription),
      availableQuantity: p.availableQuantity != null ? Number(p.availableQuantity) : null,
      availabilityKnown: Boolean(p.availabilityKnown),
    }));
  }, [apiProducts]);

  const products = allProducts;

  const categoryChips = useMemo(
    () => [{ id: 'all', label: 'Barchasi' }, ...apiCategories.map((c) => ({ id: c, label: c }))],
    [apiCategories],
  );

  const hasActiveSearch = Boolean(debouncedQuery) || cat !== 'all';
  const sortLabel = SORT_OPTIONS.find((s) => s.key === sort)?.label || 'Saralash';
  const hasBranch = branchId != null;

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
      const stock = stockPresentation(p, hasBranch);
      if (!stock.canAdd) {
        toast('Savat', 'Bu filialda mahsulot mavjud emas.');
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
    [hasBranch, refresh],
  );

  const clearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
    syncQueryToRoute('');
  };

  const onSearchSubmit = () => {
    const q = query.trim();
    setDebouncedQuery(q);
    syncQueryToRoute(q);
  };

  const clearFilters = () => {
    clearSearch();
    setCat('all');
    setSort('default');
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            width: contentWidth,
            paddingHorizontal: sidePad,
            paddingBottom: 32 + (Platform.OS === 'web' ? 20 : 8),
          },
        ]}
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

        <View style={[styles.searchBar, narrow && styles.searchBarNarrow]}>
          <Feather name="search" size={18} color={PURPLE_DEEP} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Dori yoki mahsulot qidirish..."
            placeholderTextColor="#A8B0C0"
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={onSearchSubmit}
            clearButtonMode="while-editing"
            accessibilityLabel="Dori yoki mahsulot qidirish"
          />
          {query ? (
            <Pressable onPress={clearSearch} hitSlop={8} accessibilityLabel="Tozalash">
              <Feather name="x" size={18} color={MUTED} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/qr')}
            hitSlop={6}
            accessibilityLabel="Mening QR kodim"
            style={styles.searchQrBtn}
          >
            <MaterialCommunityIcons name="line-scan" size={22} color={PURPLE_DEEP} />
          </Pressable>
        </View>

        {catError ? (
          <View style={styles.catErrorRow}>
            <Text style={styles.catErrorText}>Kategoriyalarni yuklab bo‘lmadi</Text>
            <Pressable onPress={loadCategories} hitSlop={8} accessibilityRole="button">
              <Text style={styles.catErrorRetry}>Qayta urinish</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.catsRow, { paddingHorizontal: sidePad }]}
          style={[styles.catsScroll, { marginHorizontal: -sidePad }]}
        >
          {catLoading && !catError && categoryChips.length <= 1 ? (
            <View style={styles.catLoadingChip}>
              <ActivityIndicator size="small" color={PURPLE} />
            </View>
          ) : null}
          {categoryChips.map((c) => {
            const active = cat === c.id;
            return (
              <Pressable
                key={c.id}
                style={styles.catItem}
                onPress={() => setCat(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.label}
              >
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

        <View style={styles.toolsRow}>
          <Pressable
            style={[styles.toolChip, narrow && styles.toolChipNarrow]}
            onPress={() => setSortOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Saralash: ${sort === 'default' ? 'Odatiy' : sortLabel}`}
          >
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
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'grid' }}
              accessibilityLabel="Katak ko‘rinish"
            >
              <MaterialCommunityIcons name="view-grid" size={16} color={viewMode === 'grid' ? '#fff' : PURPLE_DEEP} />
            </Pressable>
            <Pressable
              style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
              onPress={() => setViewMode('list')}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'list' }}
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
              <Pressable style={styles.resetBtn} onPress={clearFilters}>
                <Text style={styles.resetBtnText}>Filtrlarni tozalash</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.resetBtn} onPress={() => loadProducts('reset')}>
                <Text style={styles.resetBtnText}>Qayta urinish</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={[styles.grid, viewMode === 'list' && styles.list, { rowGap: gridGap }]}>
            <Text style={styles.branchHint}>
              {hasBranch
                ? `Mavjudlik savat filialiga bog‘langan · jami: ${total}`
                : 'Filial tanlanmagan — qoldiq ko‘rsatilmaydi (savat/checkoutda tanlang)'}
            </Text>
            {products.map((p) => (
              <View
                key={String(p.id)}
                style={viewMode === 'grid' ? [styles.gridItem, { width: cardWidth }] : styles.listItem}
              >
                <ProductCard
                  item={p}
                  list={viewMode === 'list'}
                  hasBranch={hasBranch}
                  adding={addingId === String(p.id)}
                  onOpen={() => openProduct(p)}
                  onAdd={() => void addToCart(p)}
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
              <Text style={styles.endList}>Ro‘yxat tugadi</Text>
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
    minHeight: 48,
    gap: 8,
    shadowColor: '#1A1040',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 12,
  },
  searchBarNarrow: {
    paddingHorizontal: 10,
    gap: 6,
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
  searchQrBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  catErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  catErrorText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: BAD_RED,
  },
  catErrorRetry: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: PURPLE,
  },
  catLoadingChip: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: CAT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  catsScroll: { marginBottom: 12, flexGrow: 0 },
  catsRow: { gap: 10, paddingBottom: 4, alignItems: 'flex-start' },
  catItem: { width: 78, alignItems: 'center', minHeight: 88 },
  catIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: CAT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  catIconActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  catLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 13,
    minHeight: 26,
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
    maxWidth: '48%',
    flexShrink: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4F2',
  },
  toolChipNarrow: {
    maxWidth: '55%',
    paddingHorizontal: 8,
  },
  toolText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: PURPLE_DEEP,
    flexShrink: 1,
  },
  viewToggle: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  viewBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4F2',
  },
  viewBtnActive: { backgroundColor: PURPLE, borderColor: PURPLE },

  branchHint: {
    width: '100%',
    color: MUTED,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
    fontFamily: 'Inter_400Regular',
  },
  endList: {
    width: '100%',
    textAlign: 'center',
    color: MUTED,
    fontSize: 12,
    marginTop: 12,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  list: { flexDirection: 'column', gap: 10 },
  gridItem: {},
  listItem: { width: '100%' },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4F2',
    shadowColor: '#1A1040',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    width: '100%',
    minHeight: 236,
    flexDirection: 'column',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardList: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4F2',
    shadowColor: '#1A1040',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  cardListMain: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    minWidth: 0,
  },
  cardMedia: {
    height: 88,
    borderRadius: 14,
    backgroundColor: '#F6F2FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EEE7FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaAccent: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D9D0EF',
  },
  rxCorner: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 26,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#F3EAFB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCCEF2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  rxChip: {
    minWidth: 26,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#F3EAFB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCCEF2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
    marginLeft: 6,
  },
  rxChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: PURPLE,
    includeFontPadding: false,
  },
  cardImageWrapList: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    minWidth: 0,
    flex: 1,
  },
  cardBodyList: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  listTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    lineHeight: 18,
    color: PURPLE_DEEP,
    minHeight: 36,
    includeFontPadding: false,
  },
  cardNameList: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    lineHeight: 19,
    color: PURPLE_DEEP,
    flex: 1,
    minWidth: 0,
    includeFontPadding: false,
  },
  cardBrand: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 15,
    height: 15,
    color: MUTED,
    includeFontPadding: false,
  },
  stockText: {
    marginTop: 6,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 14,
    height: 14,
    color: MUTED,
    includeFontPadding: false,
  },
  stockOk: { color: '#3D7A55' },
  stockBad: { color: BAD_RED },
  cardSpacer: {
    flex: 1,
    minHeight: 8,
  },
  cardFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardFooterList: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  priceCol: { flex: 1, minWidth: 0, paddingRight: 4 },
  cardPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 19,
    color: PURPLE,
    includeFontPadding: false,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addBtnBusy: { opacity: 0.75 },
  addBtnDisabled: { backgroundColor: '#C4B5D8', opacity: 1 },

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
