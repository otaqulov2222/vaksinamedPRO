import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { localizedName } from '@/lib/i18n/data';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialogs';
import type { TFunction, TranslationKey } from '@/lib/i18n';
import { localizeError } from '@/lib/i18n/errors';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F3F1F7';
const CARD = '#FFFFFF';
const BORDER = '#E9E6F0';
const LAVENDER = '#F1EBFF';
const CAT_BG = '#F1EBFF';
const YELLOW = '#FFCC00';
const BAD_RED = '#B91C1C';

const PRODUCT_IMAGES: Record<string, any> = {
  'cat-p1': require('../../assets/images/cat-p1-d3.png'),
  'cat-p2': require('../../assets/images/cat-p2-c.png'),
  'cat-p3': require('../../assets/images/cat-p3-mg.png'),
  'cat-p4': require('../../assets/images/cat-p4-omega.png'),
  'cat-p5': require('../../assets/images/cat-p5-zn.png'),
  'cat-p6': require('../../assets/images/cat-p6-para.png'),
};

function getProductImage(item: { id?: number | string; analogGroup?: string; icon?: string }) {
  const id = Number(item.id);
  if (id === 1) return PRODUCT_IMAGES['cat-p1'];
  if (id === 2) return PRODUCT_IMAGES['cat-p2'];
  if (id === 3) return PRODUCT_IMAGES['cat-p3'];
  if (id === 4) return PRODUCT_IMAGES['cat-p4'];
  if (id === 5) return PRODUCT_IMAGES['cat-p5'];
  if (id === 6 || id === 7 || id === 8) return PRODUCT_IMAGES['cat-p6'];

  const group = String(item.analogGroup || '').toLowerCase();
  if (group.includes('vitamin-d')) return PRODUCT_IMAGES['cat-p1'];
  if (group.includes('vitamin-c')) return PRODUCT_IMAGES['cat-p2'];
  if (group.includes('magnesium')) return PRODUCT_IMAGES['cat-p3'];
  if (group.includes('omega')) return PRODUCT_IMAGES['cat-p4'];
  if (group.includes('zinc')) return PRODUCT_IMAGES['cat-p5'];
  if (group.includes('analgesic')) return PRODUCT_IMAGES['cat-p6'];

  return null;
}

function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/\s*\(Demo\)/gi, '')
    .replace(/\[TEST\s*\/\s*DEMO\]\s*/gi, '')
    .replace(/\s*Ushbu ma'lumot staging sinov muhiti uchun demo hisoblanadi\.?\s*Haqiqiy dori narxi va zaxirasi emas\.?/gi, '')
    .trim();
}

function getCategoryVisual(catId: string): {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  bg: string;
  color: string;
} {
  const c = catId.toLowerCase();
  if (c === 'all') return { icon: 'view-grid', bg: '#F3EEFF', color: '#6A22D6' };
  if (c.includes('vitamin')) return { icon: 'pill', bg: '#FEF3C7', color: '#D97706' };
  if (c.includes('allergiya') || c.includes('allerg')) return { icon: 'flower-outline', bg: '#FCE7F3', color: '#DB2777' };
  if (c.includes('antibiotik') || c.includes('antibiot')) return { icon: 'shield-plus-outline', bg: '#E0F2FE', color: '#0284C7' };
  if (c.includes('antiseptik') || c.includes('antisept')) return { icon: 'spray-bottle', bg: '#E0E7FF', color: '#4F46E5' };
  if (c.includes('og') || c.includes('pain') || c.includes('isitma')) return { icon: 'thermometer', bg: '#FEE2E2', color: '#DC2626' };
  if (c.includes('shamollash') || c.includes('cold') || c.includes('gripp')) return { icon: 'weather-windy', bg: '#CCFBF1', color: '#0D9488' };
  if (c.includes('yurak') || c.includes('heart') || c.includes('kardio')) return { icon: 'heart-pulse', bg: '#FFE4E6', color: '#E11D48' };
  if (c.includes('oshqozon') || c.includes('hazm') || c.includes('stomach')) return { icon: 'stomach', bg: '#FFEDD5', color: '#EA580C' };
  if (c.includes('koz') || c.includes('eye')) return { icon: 'eye-outline', bg: '#CFFAFE', color: '#0891B2' };
  if (c.includes('teri') || c.includes('skin')) return { icon: 'hand-water', bg: '#D1FAE5', color: '#059669' };
  if (c.includes('bola') || c.includes('baby') || c.includes('kid')) return { icon: 'baby-bottle-outline', bg: '#FDF4FF', color: '#C026D3' };
  if (c.includes('tibbiy') || c.includes('buyum')) return { icon: 'medical-bag', bg: '#EDE9FE', color: '#7C3AED' };
  return { icon: 'medical-bag', bg: '#F1F5F9', color: '#475569' };
}

type CatId = string;
type SortKey = 'default' | 'price_asc' | 'price_desc' | 'name';
type QuickFilterKey = 'all' | 'otc' | 'cashback' | 'under50k';

const POPULAR_SEARCHES = ['Vitamin D3', 'Omega-3', 'Magniy B6', 'Paratsetamol', 'Rux', 'ACC']; // i18n-ignore

const SORT_OPTIONS: { key: SortKey; labelKey: TranslationKey }[] = [
  { key: 'default', labelKey: 'catalog.sortDefault' },
  { key: 'price_asc', labelKey: 'catalog.sortPriceAsc' },
  { key: 'price_desc', labelKey: 'catalog.sortPriceDesc' },
  { key: 'name', labelKey: 'catalog.sortName' },
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
  analogGroup?: string;
  image?: any;
};

const PAGE_SIZE = 20;

function routeQueryValue(params: { q?: string | string[] }): string {
  if (typeof params.q === 'string') return params.q;
  if (Array.isArray(params.q) && typeof params.q[0] === 'string') return params.q[0];
  return '';
}

/** Honest stock copy — never invents availability. */
function stockPresentation(
  t: TFunction,
  item: Product,
  hasBranch: boolean,
): { text: string; tone: 'ok' | 'bad' | 'neutral'; canAdd: boolean } {
  if (!hasBranch) {
    return { text: t('catalog.stockNoBranch'), tone: 'neutral', canAdd: true };
  }
  if (!item.availabilityKnown) {
    return { text: t('catalog.stockChecking'), tone: 'neutral', canAdd: true };
  }
  const qty = Math.max(0, Number(item.availableQuantity) || 0);
  if (qty > 0) {
    return { text: t('catalog.stockInBranch'), tone: 'ok', canAdd: true };
  }
  return { text: t('catalog.stockNotInBranch'), tone: 'bad', canAdd: false };
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
  isRecentlyAdded,
}: {
  item: Product;
  list: boolean;
  hasBranch: boolean;
  onOpen: () => void;
  onAdd: () => void;
  adding: boolean;
  isRecentlyAdded?: boolean;
}) {
  const { t, fmt } = useApp();
  const stock = stockPresentation(t, item, hasBranch);
  const addDisabled = adding || !stock.canAdd;
  const showRx = Boolean(item.requiresPrescription);
  const priceText = fmt.money(item.price);
  const addA11y = stock.canAdd ? t('catalog.addToCart') : t('catalog.addToCartUnavailableA11y');

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
            {item.image ? (
              <Image
                source={item.image}
                style={styles.productImgList}
                resizeMode="contain"
                fadeDuration={0}
              />
            ) : (
              <View style={styles.iconBubble}>
                <MaterialCommunityIcons name={productIconName(item.icon)} size={28} color={PURPLE} />
              </View>
            )}
          </View>
          <View style={styles.cardBodyList}>
            <View style={styles.listTopRow}>
              <Text style={styles.cardNameList} numberOfLines={2}>
                {cleanText(item.nameUz)}
              </Text>
              {showRx ? (
                <View style={styles.rxChip}>
                  <Text style={styles.rxChipText}>{t('catalog.rxShort')}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardBrand} numberOfLines={1}>
              {cleanText(item.manufacturer || item.category)}
            </Text>
            <View style={styles.stockRow}>
              <View
                style={[
                  styles.stockDot,
                  stock.tone === 'ok' && styles.stockDotOk,
                  stock.tone === 'bad' && styles.stockDotBad,
                ]}
              />
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
          </View>
        </Pressable>
        <View style={styles.cardFooterList}>
          <Pressable
            style={styles.priceCol}
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${item.nameUz}, ${priceText}`}
          >
            <Text style={styles.cardPrice} numberOfLines={1}>
              {priceText}
            </Text>
            <Text style={styles.cashbackHintText} numberOfLines={1}>
              {t('catalog.cashbackEarnHint', { amount: fmt.money(Math.round(item.price * 0.05)) })}
            </Text>
          </Pressable>
          {isRecentlyAdded ? (
            <View style={[styles.addBtn, styles.addBtnSuccess]}>
              <Feather name="check" size={16} color="#fff" />
            </View>
          ) : (
            <Pressable
              style={[styles.addBtn, addDisabled && styles.addBtnDisabled, adding && styles.addBtnBusy]}
              disabled={addDisabled}
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityState={{ disabled: addDisabled }}
              accessibilityLabel={addA11y}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="shopping-cart" size={16} color="#fff" />
              )}
            </Pressable>
          )}
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
          {/* Floating +5% cashback badge */}
          <View style={styles.cashbackBadge}>
            <Text style={styles.cashbackBadgeText}>{t('catalog.cashbackBadge')}</Text>
          </View>

          {/* Floating rating or Rx badge */}
          {showRx ? (
            <View style={styles.rxCorner}>
              <Text style={styles.rxChipText}>{t('catalog.rxShort')}</Text>
            </View>
          ) : (
            <View style={styles.ratingBadge}>
              <Feather name="star" size={10} color="#D97706" />
              {/* i18n-ignore */}
              <Text style={styles.ratingBadgeText}>4.9</Text>
            </View>
          )}

          {item.image ? (
            <Image
              source={item.image}
              style={styles.productImg}
              resizeMode="contain"
              fadeDuration={0}
            />
          ) : (
            <View style={styles.iconBubble}>
              <MaterialCommunityIcons name={productIconName(item.icon)} size={44} color={PURPLE} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardBrand} numberOfLines={1}>
            {cleanText(item.manufacturer || item.category)}
          </Text>
          <Text style={styles.cardName} numberOfLines={2}>
            {cleanText(item.nameUz)}
          </Text>

          <View style={styles.cardSpacer} />

          <View style={styles.stockRow}>
            <View
              style={[
                styles.stockDot,
                stock.tone === 'ok' && styles.stockDotOk,
                stock.tone === 'bad' && styles.stockDotBad,
              ]}
            />
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
        </View>
      </Pressable>

      <View style={styles.cardFooter}>
        <Pressable
          style={styles.priceCol}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${item.nameUz}, ${priceText}`}
        >
          <Text style={styles.cardPrice} numberOfLines={1}>
            {priceText}
          </Text>
          <Text style={styles.cashbackHintText} numberOfLines={1}>
            {t('catalog.cashbackEarnHint', { amount: fmt.money(Math.round(item.price * 0.05)) })}
          </Text>
        </Pressable>
        {isRecentlyAdded ? (
          <View style={[styles.addBtn, styles.addBtnSuccess]}>
            <Feather name="check" size={16} color="#fff" />
          </View>
        ) : (
          <Pressable
            style={[styles.addBtn, addDisabled && styles.addBtnDisabled, adding && styles.addBtnBusy]}
            disabled={addDisabled}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityState={{ disabled: addDisabled }}
            accessibilityLabel={addA11y}
          >
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="shopping-cart" size={16} color="#fff" />
            )}
          </Pressable>
        )}
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
  const { t } = useApp();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
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
          <Pressable style={styles.sheetCancel} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.sheetCancelText}>{t('common.close')}</Text>
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
  const { refresh, cartCount, cartSubtotal, t, fmt, language } = useApp();
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
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>('all');
  const [filterOpen, setFilterOpen] = useState(false);
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
  const cardWidth = Math.floor((contentWidth - sidePad * 2 - gridGap) / 2);

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
    return apiProducts.map((p) => {
      const cleanName = localizedName(language, p).replace(/\s*\(Demo\)/gi, '').trim();
      const cleanMan = String(p.manufacturer || '').replace(/\s*\(Demo\)/gi, '').trim();
      return {
        id: p.id,
        nameUz: cleanName,
        manufacturer: cleanMan,
        category: String(p.category || ''),
        price: Number(p.price || 0),
        icon: String(p.icon || 'pill'),
        unit: p.unit != null ? String(p.unit) : undefined,
        requiresPrescription: Boolean(p.requiresPrescription),
        availableQuantity: p.availableQuantity != null ? Number(p.availableQuantity) : null,
        availabilityKnown: Boolean(p.availabilityKnown),
        analogGroup: String(p.analogGroup || ''),
        image: getProductImage(p),
      };
    });
  }, [apiProducts, language]);

  const products = useMemo((): Product[] => {
    return allProducts.filter((p) => {
      if (quickFilter === 'otc' && p.requiresPrescription) return false;
      if (quickFilter === 'under50k' && p.price > 50000) return false;
      return true;
    });
  }, [allProducts, quickFilter]);

  const quickFilterOptions = useMemo(
    () => [
      { key: 'all', label: t('catalog.filterAll') },
      { key: 'otc', label: t('catalog.filterOtc') },
      { key: 'cashback', label: t('catalog.filterCashback') },
      { key: 'under50k', label: t('catalog.filterUnder50k') },
    ],
    [t],
  );

  const quickFilterLabel = useMemo(() => {
    const found = quickFilterOptions.find((o) => o.key === quickFilter);
    return found ? found.label : t('catalog.filterTitle');
  }, [quickFilter, quickFilterOptions, t]);

  const categoryChips = useMemo(
    () => [{ id: 'all', label: t('common.all') }, ...apiCategories.map((c) => ({ id: c, label: c }))],
    [apiCategories, t],
  );

  const sortOptions = useMemo(
    () => SORT_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) })),
    [t],
  );

  const hasActiveSearch = Boolean(debouncedQuery) || cat !== 'all';
  const sortLabel = sortOptions.find((s) => s.key === sort)?.label || t('catalog.sortTitle');
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
    notify(p.nameUz, `${p.manufacturer}\n${fmt.money(p.price)}`);
  }, [fmt]);

  const addToCart = useCallback(
    async (p: Product) => {
      const key = String(p.id);
      if (!/^\d+$/.test(key) && typeof p.id !== 'number') {
        notify(t('common.navCart'), t('catalog.addRequiresLogin'));
        return;
      }
      const stock = stockPresentation(t, p, hasBranch);
      if (!stock.canAdd) {
        notify(t('common.navCart'), t('catalog.notInBranchMessage'));
        return;
      }
      setAddingId(key);
      try {
        await api.addToCart(Number(p.id));
        await refresh();
        setRecentlyAddedId(key);
        setTimeout(() => {
          setRecentlyAddedId((cur) => (cur === key ? null : cur));
        }, 1800);
        notify(t('common.navCart'), t('catalog.addedToCart', { name: p.nameUz }));
      } catch (e) {
        notify(
          t('common.errorTitle'),
          localizeError(e, t, {
            byCode: {
              STOCK_UNAVAILABLE: 'catalog.errorStockUnavailable',
              PRODUCT_NOT_FOUND: 'catalog.productNotFound',
            },
            fallback: 'catalog.addToCartFailed',
          }),
        );
      } finally {
        setAddingId(null);
      }
    },
    [hasBranch, refresh, t],
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
    setQuickFilter('all');
  };

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 8) }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            width: '100%',
            maxWidth: 480,
            paddingHorizontal: sidePad,
            paddingBottom:
              cartCount > 0
                ? 76 + (Platform.OS === 'web' ? 8 : 4)
                : Platform.OS === 'web'
                  ? 24
                  : Math.max(insets.bottom, 16),
          },
        ]}
        horizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        bounces={false}
        directionalLockEnabled
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
          <Pressable style={styles.iconBtn} onPress={goBack} accessibilityLabel={t('common.back')}>
            <Feather name="chevron-left" size={22} color={PURPLE_DEEP} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {t('common.navCatalog')}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {t('catalog.catalogSubtitle')}
            </Text>
          </View>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push('/cart')}
            accessibilityLabel={cartCount > 0 ? t('catalog.cartA11yCount', { count: cartCount }) : t('common.navCart')}
          >
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
            placeholder={t('catalog.searchPlaceholder')}
            placeholderTextColor="#A8B0C0"
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={onSearchSubmit}
            clearButtonMode="while-editing"
            accessibilityLabel={t('catalog.searchA11y')}
          />
          {query ? (
            <Pressable onPress={clearSearch} hitSlop={8} accessibilityLabel={t('catalog.clearSearchA11y')}>
              <Feather name="x" size={18} color={MUTED} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/prescription')}
            hitSlop={6}
            accessibilityLabel={t('catalog.prescriptionScanAction')}
            style={styles.searchQrBtn}
          >
            <MaterialCommunityIcons name="line-scan" size={20} color={PURPLE} />
          </Pressable>
        </View>

        {catError ? (
          <View style={styles.catErrorRow}>
            <Text style={styles.catErrorText}>{t('catalog.categoriesLoadFailed')}</Text>
            <Pressable onPress={loadCategories} hitSlop={8} accessibilityRole="button">
              <Text style={styles.catErrorRetry}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.catsContainer, { marginHorizontal: -sidePad, paddingHorizontal: sidePad }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            directionalLockEnabled
            alwaysBounceVertical={false}
            bounces={false}
            contentContainerStyle={styles.catsRow}
            style={styles.catsScroll}
          >
            {catLoading && !catError && categoryChips.length <= 1 ? (
              <View style={styles.catLoadingChip}>
                <ActivityIndicator size="small" color={PURPLE} />
              </View>
            ) : null}
            {categoryChips.map((c) => {
              const active = cat === c.id;
              const visual = getCategoryVisual(c.id);
              return (
                <Pressable
                  key={c.id}
                  style={[styles.catCard, active && styles.catCardActive]}
                  onPress={() => setCat(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={c.label}
                >
                  <View
                    style={[
                      styles.catCardIconWrap,
                      { backgroundColor: active ? 'rgba(255,255,255,0.22)' : visual.bg },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={visual.icon}
                      size={15}
                      color={active ? '#FFFFFF' : visual.color}
                    />
                  </View>
                  <Text
                    style={[styles.catCardText, active && styles.catCardTextActive]}
                    numberOfLines={1}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.toolsRow}>
          <Pressable
            style={[styles.toolChipFull, quickFilter !== 'all' && styles.toolChipActive]}
            onPress={() => setFilterOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('catalog.filterTitle')}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={15}
              color={quickFilter !== 'all' ? '#FFFFFF' : PURPLE}
            />
            <Text
              style={[styles.toolTextFull, quickFilter !== 'all' && styles.toolTextActive]}
              numberOfLines={1}
            >
              {quickFilter === 'all' ? t('catalog.filterTitle') : quickFilterLabel}
            </Text>
            {quickFilter !== 'all' ? (
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation?.();
                  setQuickFilter('all');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('catalog.clearFilters')}
              >
                <Feather name="x" size={12} color="#FFFFFF" />
              </Pressable>
            ) : (
              <Feather name="chevron-down" size={13} color={MUTED} />
            )}
          </Pressable>

          <Pressable
            style={styles.toolChipFull}
            onPress={() => setSortOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('catalog.sortA11y', { label: sortLabel })}
          >
            <MaterialCommunityIcons name="swap-vertical" size={16} color={PURPLE} />
            <Text style={styles.toolTextFull} numberOfLines={1}>
              {sort === 'default' ? t('catalog.sortTitle') : sortLabel}
            </Text>
            <Feather name="chevron-down" size={13} color={MUTED} />
          </Pressable>

          <Pressable
            style={styles.viewToggleBtn}
            onPress={() => setViewMode((m) => (m === 'grid' ? 'list' : 'grid'))}
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'grid' ? t('catalog.viewListA11y') : t('catalog.viewGridA11y')}
          >
            <MaterialCommunityIcons
              name={viewMode === 'grid' ? 'view-grid' : 'format-list-bulleted'}
              size={17}
              color={PURPLE}
            />
          </Pressable>
        </View>

        {debouncedQuery.trim() ? (
          <View style={styles.searchCountBar}>
            <Text style={styles.searchCountText}>
              {t('catalog.foundCount', { count: products.length })}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={PURPLE} />
            <Text style={styles.emptyText}>{t('common.loading')}</Text>
          </View>
        ) : loadError ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="cloud-off-outline" size={40} color={MUTED} />
            <Text style={styles.emptyTitle}>{t('catalog.loadFailedTitle')}</Text>
            <Text style={styles.emptyText}>
              {query.trim()
                ? t('catalog.loadFailedWithQuery', { query: query.trim() })
                : t('catalog.loadFailedHint')}
            </Text>
            <Pressable style={styles.resetBtn} onPress={() => loadProducts('reset')}>
              <Text style={styles.resetBtnText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="package-variant" size={40} color={MUTED} />
            <Text style={styles.emptyTitle}>
              {hasActiveSearch ? t('catalog.emptySearchTitle') : t('catalog.emptyTitle')}
            </Text>
            <Text style={styles.emptyText}>
              {hasActiveSearch
                ? debouncedQuery
                  ? t('catalog.emptyQueryText', { query: debouncedQuery })
                  : t('catalog.emptyCategoryText')
                : t('catalog.emptyCatalogText')}
            </Text>
            {hasActiveSearch ? (
              <Pressable style={styles.resetBtn} onPress={clearFilters}>
                <Text style={styles.resetBtnText}>{t('catalog.clearFilters')}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.resetBtn} onPress={() => loadProducts('reset')}>
                <Text style={styles.resetBtnText}>{t('common.retry')}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={[styles.grid, viewMode === 'list' && styles.list, { rowGap: gridGap }]}>
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
                  isRecentlyAdded={recentlyAddedId === String(p.id)}
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
                <Text style={styles.resetBtnText}>{t('catalog.loadMoreRetry')}</Text>
              </Pressable>
            ) : null}
            {!hasMore && products.length > 0 ? (
              <Text style={styles.endList}>{t('catalog.endOfList')}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Uzum & Yandex Style Floating Cart Bar */}
      {cartCount > 0 ? (
        <View
          style={[
            styles.floatingCartContainer,
            { width: '100%', maxWidth: 480, paddingHorizontal: sidePad },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            style={({ pressed }) => [
              styles.floatingCartBtn,
              pressed && { opacity: 0.94, transform: [{ scale: 0.985 }] },
            ]}
            onPress={() => router.push('/cart')}
            accessibilityRole="button"
            accessibilityLabel={t('catalog.floatingCartA11y', {
              count: cartCount,
              total: fmt.money(cartSubtotal),
            })}
          >
            <View style={styles.floatingCartLeft}>
              <View style={styles.floatingCartIconWrap}>
                <Feather name="shopping-bag" size={18} color="#FFFFFF" />
                <View style={styles.floatingCartBadge}>
                  <Text style={styles.floatingCartBadgeText}>
                    {cartCount > 99 ? '99+' : String(cartCount)}
                  </Text>
                </View>
              </View>
              <View style={styles.floatingCartTexts}>
                <Text style={styles.floatingCartTitle}>
                  {t('catalog.floatingCartTitle', { count: cartCount })}
                </Text>
                {cartSubtotal > 0 ? (
                  <Text style={styles.floatingCartTotal}>
                    {fmt.money(cartSubtotal)}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.floatingCartRight}>
              <Text style={styles.floatingCartCtaText}>{t('catalog.floatingCartCta')}</Text>
              <Feather name="arrow-right" size={16} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
      ) : null}

      <Sheet
        visible={filterOpen}
        title={t('catalog.filterTitle')}
        options={quickFilterOptions}
        selected={quickFilter}
        onSelect={(k) => setQuickFilter(k as QuickFilterKey)}
        onClose={() => setFilterOpen(false)}
      />

      <Sheet
        visible={sortOpen}
        title={t('catalog.sortTitle')}
        options={sortOptions}
        selected={sort}
        onSelect={(k) => setSort(k as SortKey)}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scroll: { flex: 1, width: '100%', maxWidth: '100%' },
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
    fontSize: 13,
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
    fontSize: 11,
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

  quickSearchRow: {
    marginBottom: 12,
    marginTop: -2,
  },
  quickSearchScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
  },
  quickSearchLabelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  quickSearchLabelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: PURPLE,
  },
  quickSearchChip: {
    backgroundColor: CARD,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  quickSearchChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: PURPLE_DEEP,
  },

  aiBanner: {
    backgroundColor: '#F5F0FF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E6DCFA',
    shadowColor: '#6A22D6',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  aiBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  aiBannerLeft: {
    flex: 1,
    minWidth: 0,
  },
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  aiMiniBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  aiMiniBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: '#854D0E',
  },
  aiBannerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  aiBannerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#6B5E8A',
  },
  aiBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2D8F8',
    flexShrink: 0,
  },
  aiActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: PURPLE,
  },

  subFiltersScroll: {
    marginBottom: 10,
  },
  subFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  subFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  subFilterChipActive: {
    backgroundColor: '#F3EEFF',
    borderColor: PURPLE,
  },
  subFilterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: '#555A6E',
  },
  subFilterChipTextActive: {
    fontFamily: 'Inter_700Bold',
    color: PURPLE,
  },

  foundCountBadge: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  foundCountText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  branchSubHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: MUTED,
    marginBottom: 8,
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: CAT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  catsContainer: {
    marginBottom: 10,
    alignSelf: 'stretch',
    width: Platform.OS === 'web' ? ('auto' as any) : undefined,
    overflow: 'hidden',
  },
  catsScroll: { flexGrow: 0, width: '100%' },
  catsRow: { gap: 8, paddingBottom: 2, alignItems: 'center' },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    paddingLeft: 6,
    paddingRight: 13,
    paddingVertical: 5.5,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ECEAF2',
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  catCardActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  catCardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCardText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: PURPLE_DEEP,
  },
  catCardTextActive: {
    color: '#FFFFFF',
  },

  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    width: '100%',
  },
  toolChipFull: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#ECEAF2',
    paddingHorizontal: 10,
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 2,
  },
  toolTextFull: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: PURPLE_DEEP,
  },
  toolChipActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    shadowColor: PURPLE,
    shadowOpacity: 0.25,
  },
  toolTextActive: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  viewToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEAF2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#1A1040',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 2,
  },
  searchCountBar: {
    marginBottom: 8,
  },
  searchCountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: PURPLE_DEEP,
  },

  branchHint: {
    width: '100%',
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
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
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ECEAF2',
    shadowColor: '#1A1040',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    width: '100%',
    minHeight: 256,
    flexDirection: 'column',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardList: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECEAF2',
    shadowColor: '#1A1040',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
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
    height: 142,
    borderRadius: 16,
    backgroundColor: '#F8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#ECE7F6',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  productImgList: {
    width: '100%',
    height: '100%',
  },
  cashbackBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    zIndex: 2,
  },
  cashbackBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    lineHeight: 12,
    color: PURPLE,
  },
  ratingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    paddingHorizontal: 5.5,
    paddingVertical: 2.5,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    zIndex: 2,
  },
  ratingBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    lineHeight: 12,
    color: '#B45309',
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
    width: 90,
    height: 90,
    borderRadius: 16,
    backgroundColor: '#F8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ECE7F6',
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
    fontSize: 13.5,
    lineHeight: 18,
    color: PURPLE_DEEP,
    minHeight: 36,
    includeFontPadding: false,
  },
  cardNameList: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: PURPLE_DEEP,
    flex: 1,
    minWidth: 0,
    includeFontPadding: false,
  },
  cardBrand: {
    marginBottom: 2,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
    color: '#7C3AED',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MUTED,
  },
  stockDotOk: {
    backgroundColor: '#10B981',
  },
  stockDotBad: {
    backgroundColor: BAD_RED,
  },
  stockText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 14,
    color: MUTED,
    includeFontPadding: false,
  },
  stockOk: { color: '#3D7A55' },
  stockBad: { color: BAD_RED },
  cardSpacer: {
    flex: 1,
    minHeight: 6,
  },
  cardFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
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
    fontSize: 15.5,
    lineHeight: 19,
    color: PURPLE_DEEP,
    includeFontPadding: false,
    flexShrink: 1,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addBtnBusy: { opacity: 0.75 },
  addBtnDisabled: { backgroundColor: '#C4B5D8', opacity: 1 },
  addBtnSuccess: { backgroundColor: '#10B981' },
  cashbackHintText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10.5,
    lineHeight: 13,
    color: PURPLE,
    marginTop: 2,
  },

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

  floatingCartContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 16 : 12,
    alignSelf: 'center',
    zIndex: 100,
  },
  floatingCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PURPLE,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    boxShadow: '0 8px 24px rgba(106, 34, 214, 0.38)',
  },
  floatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  floatingCartIconWrap: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: PURPLE,
  },
  floatingCartBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  floatingCartTexts: {
    justifyContent: 'center',
  },
  floatingCartTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  floatingCartTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#F3E8FF',
    marginTop: 1,
  },
  floatingCartRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  floatingCartCtaText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
});
