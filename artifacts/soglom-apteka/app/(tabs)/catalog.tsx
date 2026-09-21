import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type CatId = 'all' | 'vitamins' | 'pain' | 'allergy' | 'skin';

const CATEGORIES: {
  id: CatId;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  match: string | null;
}[] = [
  { id: 'all', label: 'Barchasi', icon: 'view-grid', match: null },
  { id: 'vitamins', label: 'Vitaminlar', icon: 'leaf', match: 'Vitaminlar' },
  { id: 'pain', label: "Og'riq va isitma", icon: 'stomach', match: 'Og‘riq va isitma' },
  { id: 'allergy', label: 'Allergiya', icon: 'flower', match: 'Allergiya' },
  { id: 'skin', label: 'Teri parvarishi', icon: 'face-woman-outline', match: 'Teri parvarishi' },
];

type SortKey = 'default' | 'price_asc' | 'price_desc' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Odatiy' },
  { key: 'price_asc', label: 'Narx: arzon' },
  { key: 'price_desc', label: 'Narx: qimmat' },
  { key: 'name', label: 'Nom: A–Z' },
];

const IMAGES: Record<string, any> = {
  'Vitamin D3 2000 IU': require('../../assets/images/cat-p1-d3.png'),
  'Askorbin kislotasi 1000 mg': require('../../assets/images/cat-p2-c.png'),
  'Magniy + B6': require('../../assets/images/cat-p3-mg.png'),
  'Omega-3 1000 mg': require('../../assets/images/cat-p4-omega.png'),
  'Rux 25 mg': require('../../assets/images/cat-p5-zn.png'),
  'Paratsetamol 500 mg': require('../../assets/images/cat-p6-para.png'),
};

const FALLBACK_IMAGE = require('../../assets/images/cat-p1-d3.png');

type Product = {
  id: number | string;
  nameUz: string;
  manufacturer: string;
  category: string;
  price: number;
  oldPrice?: number;
  discount?: string;
  imageUrl?: string | null;
  localImage: any;
};

const SEED_FALLBACK: Product[] = [
  {
    id: 'm1',
    nameUz: 'Vitamin D3 2000 IU',
    manufacturer: 'Solgar',
    category: 'Vitaminlar',
    price: 89000,
    oldPrice: 99000,
    discount: '-10%',
    localImage: IMAGES['Vitamin D3 2000 IU'],
  },
  {
    id: 'm2',
    nameUz: 'Askorbin kislotasi 1000 mg',
    manufacturer: 'Evalar',
    category: 'Vitaminlar',
    price: 42000,
    localImage: IMAGES['Askorbin kislotasi 1000 mg'],
  },
  {
    id: 'm3',
    nameUz: 'Magniy + B6',
    manufacturer: 'Now Foods',
    category: 'Vitaminlar',
    price: 76000,
    localImage: IMAGES['Magniy + B6'],
  },
  {
    id: 'm4',
    nameUz: 'Omega-3 1000 mg',
    manufacturer: 'Doppelherz',
    category: 'Vitaminlar',
    price: 118000,
    localImage: IMAGES['Omega-3 1000 mg'],
  },
  {
    id: 'm5',
    nameUz: 'Rux 25 mg',
    manufacturer: "Nature's Bounty",
    category: 'Vitaminlar',
    price: 39000,
    localImage: IMAGES['Rux 25 mg'],
  },
  {
    id: 'm6',
    nameUz: 'Paratsetamol 500 mg',
    manufacturer: 'Nika Pharm',
    category: 'Og‘riq va isitma',
    price: 8000,
    localImage: IMAGES['Paratsetamol 500 mg'],
  },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

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
        {item.discount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{item.discount}</Text>
          </View>
        ) : null}
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
        <Image
          source={item.imageUrl ? { uri: item.imageUrl } : item.localImage}
          style={styles.cardImage}
          resizeMode="contain"
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
            {item.oldPrice ? (
              <Text style={styles.cardOld} numberOfLines={1}>
                {priceUz(item.oldPrice)}
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
  const [cat, setCat] = useState<CatId>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<SortKey>('default');
  const [onlySale, setOnlySale] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [apiProducts, setApiProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const contentWidth = Math.min(width, 480);
  const gridGap = 12;
  const sidePad = 16;
  const cardWidth = (contentWidth - sidePad * 2 - gridGap) / 2;

  useEffect(() => {
    if (typeof params.q === 'string' && params.q) setQuery(params.q);
  }, [params.q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void api
      .products()
      .then((data) => {
        if (alive) setApiProducts(data.products || []);
      })
      .catch(() => {
        if (alive) setApiProducts([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const allProducts = useMemo((): Product[] => {
    if (!apiProducts.length) return SEED_FALLBACK;
    return apiProducts.map((p) => {
      const name = String(p.nameUz || p.name || '');
      const price = Number(p.price || 0);
      const old = p.oldPrice != null ? Number(p.oldPrice) : name === 'Vitamin D3 2000 IU' ? 99000 : undefined;
      const discount =
        p.discountPercent != null
          ? `-${p.discountPercent}%`
          : old && old > price
            ? `-${Math.round(((old - price) / old) * 100)}%`
            : undefined;
      return {
        id: p.id,
        nameUz: name,
        manufacturer: String(p.manufacturer || ''),
        category: String(p.category || ''),
        price,
        oldPrice: old && old > price ? old : undefined,
        discount,
        imageUrl: p.imageUrl || null,
        localImage: IMAGES[name] || FALLBACK_IMAGE,
      };
    });
  }, [apiProducts]);

  const products = useMemo(() => {
    const catDef = CATEGORIES.find((c) => c.id === cat);
    let list = allProducts.filter((p) => {
      if (catDef?.match) {
        if (norm(p.category) !== norm(catDef.match)) return false;
      }
      if (onlySale && !p.discount && !p.oldPrice) return false;
      const q = norm(query);
      if (q && !norm(`${p.nameUz} ${p.manufacturer} ${p.category}`).includes(q)) return false;
      return true;
    });

    if (sort === 'price_asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === 'name') list = [...list].sort((a, b) => a.nameUz.localeCompare(b.nameUz, 'uz'));

    return list;
  }, [allProducts, cat, onlySale, query, sort]);

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
          <Pressable onPress={() => router.push('/qr')} hitSlop={6} accessibilityLabel="Skaner">
            <MaterialCommunityIcons name="line-scan" size={22} color={PURPLE_DEEP} />
          </Pressable>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catsRow}
          style={styles.catsScroll}
        >
          {CATEGORIES.map((c) => {
            const active = cat === c.id;
            return (
              <Pressable key={c.id} style={styles.catItem} onPress={() => setCat(c.id)}>
                <View style={[styles.catIcon, active && styles.catIconActive]}>
                  <MaterialCommunityIcons name={c.icon} size={22} color={active ? '#fff' : PURPLE} />
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
          <Pressable
            style={[styles.toolChip, onlySale && styles.toolChipActive]}
            onPress={() => setFilterOpen(true)}
          >
            <MaterialCommunityIcons name="tune-variant" size={16} color={onlySale ? '#fff' : PURPLE_DEEP} />
            <Text style={[styles.toolText, onlySale && styles.toolTextActive]} numberOfLines={1}>
              Filtrlar
            </Text>
            <Feather name="chevron-down" size={14} color={onlySale ? '#fff' : MUTED} />
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
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="package-variant" size={40} color={MUTED} />
            <Text style={styles.emptyTitle}>Mahsulot topilmadi</Text>
            <Text style={styles.emptyText}>Boshqa kategoriya yoki qidiruvni sinab ko‘ring</Text>
            <Pressable
              style={styles.resetBtn}
              onPress={() => {
                setQuery('');
                setCat('all');
                setOnlySale(false);
                setSort('default');
              }}
            >
              <Text style={styles.resetBtnText}>Filtrlarni tozalash</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.grid, viewMode === 'list' && styles.list]}>
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

      <Sheet
        visible={filterOpen}
        title="Filtrlar"
        options={[
          { key: 'all', label: 'Barcha mahsulotlar' },
          { key: 'sale', label: 'Faqat chegirmadagilar' },
        ]}
        selected={onlySale ? 'sale' : 'all'}
        onSelect={(k) => setOnlySale(k === 'sale')}
        onClose={() => setFilterOpen(false)}
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
