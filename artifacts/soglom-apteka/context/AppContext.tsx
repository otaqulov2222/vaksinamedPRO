import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { api, getAuthToken, setAuthToken } from '@/lib/api';
import { clearRegisterDraft } from '@/lib/registerDraft';
import { isLanguage, type Language } from '@/lib/languages';

export type { Language };
export type Transaction = {
  id: string;
  date: string;
  title: string;
  branch: string;
  amount: number;
  cashback: number;
  /** API loyalty_ledger kind — void = POS/cheque cancellation display row (not EARN). */
  kind: 'earn' | 'use' | 'void';
};
export type Reward = {
  id: string;
  title: string;
  subtitle: string;
  points: number;
  icon: string;
  accent: string;
};

const dictionary: Record<Language, Record<string, string>> = {
  uz: {
    home: 'Bosh sahifa', catalog: 'Katalog', cashback: 'Cashback', bonuses: 'Bonuslar', purchases: 'Buyurtmalar', profile: 'Profil',
    hello: 'Salom', welcome: 'Har bir xarid — ko‘proq imkoniyat', balance: 'Mening balansim', spend: 'Cashback ishlatish', history: 'Tarix',
    purchasesCount: 'Xaridlar', saved: 'Tejalgan summa', level: 'Daraja', gold: 'Gold daraja', nextLevel: 'Keyingi darajagacha', points: 'ball',
    quickAccess: 'Tezkor xizmatlar', myQr: 'Mening QR kodim', branches: 'Dorixonalar', offers: 'Aksiyalar', cart: 'Savat', checkout: 'Rasmiylashtirish',
    nearby: 'Eng yaqin dorixona', openNow: 'Ochiq', details: 'Batafsil', all: 'Barchasi', available: 'Mavjud', earned: 'To‘plangan', used: 'Ishlatilgan',
    noData: 'Hozircha ma’lumot yo‘q', redeem: 'Almashtirish', redeemed: 'Almashtirildi', profileInfo: 'Profil ma’lumotlari', settings: 'Sozlamalar',
    language: 'Til', notifications: 'Bildirishnomalar', help: 'Yordam markazi', about: 'Ilova haqida', logout: 'Chiqish', chooseLanguage: 'Tilni tanlang',
    uzbek: 'O‘zbekcha', russian: 'Русский', english: 'English', rating: 'Xodimni baholash', send: 'Yuborish', thankYou: 'Fikringiz uchun rahmat',
    selectRating: 'Xizmatni qanday baholaysiz?', pickup: 'Filialdan olish', delivery: 'Yetkazib berish', payOnline: 'Onlayn to‘lov',
    payBranch: 'Filialda to‘lash', payCod: 'Yetkazib berganda', search: 'Dori qidirish',
  },
  ru: {
    home: 'Главная', catalog: 'Каталог', cashback: 'Кэшбэк', bonuses: 'Бонусы', purchases: 'Заказы', profile: 'Профиль',
    hello: 'Здравствуйте', welcome: 'Каждая покупка — больше возможностей', balance: 'Мой баланс', spend: 'Потратить кэшбэк', history: 'История',
    purchasesCount: 'Покупки', saved: 'Сэкономлено', level: 'Уровень', gold: 'Золотой уровень', nextLevel: 'До следующего уровня', points: 'баллов',
    quickAccess: 'Быстрые сервисы', myQr: 'Мой QR-код', branches: 'Аптеки', offers: 'Акции', cart: 'Корзина', checkout: 'Оформление',
    nearby: 'Ближайшая аптека', openNow: 'Открыто', details: 'Подробнее', all: 'Все', available: 'Доступные', earned: 'Начисления', used: 'Списания',
    noData: 'Пока нет данных', redeem: 'Обменять', redeemed: 'Обменено', profileInfo: 'Данные профиля', settings: 'Настройки',
    language: 'Язык', notifications: 'Уведомления', help: 'Центр помощи', about: 'О приложении', logout: 'Выйти', chooseLanguage: 'Выберите язык',
    uzbek: 'O‘zbekcha', russian: 'Русский', english: 'English', rating: 'Оценить сотрудника', send: 'Отправить', thankYou: 'Спасибо за отзыв',
    selectRating: 'Как вы оцениваете сервис?', pickup: 'Самовывоз', delivery: 'Доставка', payOnline: 'Онлайн оплата',
    payBranch: 'Оплата в аптеке', payCod: 'При получении', search: 'Поиск лекарств',
  },
  en: {
    home: 'Home', catalog: 'Catalog', cashback: 'Cashback', bonuses: 'Bonuses', purchases: 'Orders', profile: 'Profile',
    hello: 'Hello', welcome: 'Every purchase brings more value', balance: 'My balance', spend: 'Use cashback', history: 'History',
    purchasesCount: 'Purchases', saved: 'You saved', level: 'Level', gold: 'Gold level', nextLevel: 'Until next level', points: 'points',
    quickAccess: 'Quick services', myQr: 'My QR code', branches: 'Pharmacies', offers: 'Offers', cart: 'Cart', checkout: 'Checkout',
    nearby: 'Nearest pharmacy', openNow: 'Open', details: 'Details', all: 'All', available: 'Available', earned: 'Earned', used: 'Used',
    noData: 'Nothing here yet', redeem: 'Redeem', redeemed: 'Redeemed', profileInfo: 'Profile information', settings: 'Settings',
    language: 'Language', notifications: 'Notifications', help: 'Help center', about: 'About the app', logout: 'Log out', chooseLanguage: 'Choose a language',
    uzbek: 'O‘zbekcha', russian: 'Русский', english: 'English', rating: 'Rate an employee', send: 'Send', thankYou: 'Thank you for your feedback',
    selectRating: 'How would you rate the service?', pickup: 'Pickup', delivery: 'Delivery', payOnline: 'Pay online',
    payBranch: 'Pay at pharmacy', payCod: 'Cash on delivery', search: 'Search medicines',
  },
};

type AppContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  loading: boolean;
  isAuthenticated: boolean;
  balance: number;
  user: { name: string; phone: string; tier: string; purchases: number; total: number; saved: number; qrCode: string };
  transactions: Transaction[];
  rewards: Reward[];
  redeemedRewards: string[];
  cartCount: number;
  refresh: () => Promise<void>;
  /** Update badge from an already-fetched cart payload (avoids a second GET). */
  syncCartCount: (count: number) => void;
  logout: () => Promise<void>;
  redeemReward: (reward: Reward) => Promise<boolean>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>('uz');
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [cartCount, setCartCount] = useState(0);

  const refresh = async () => {
    try {
      const token = await getAuthToken();
      const tg = typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!token && !tg && !process.env.EXPO_PUBLIC_TELEGRAM_ID) {
        setIsAuthenticated(false);
        setProfile(null);
        setCartCount(0);
        return;
      }
      const [nextProfile, cart] = await Promise.all([
        api.profile(),
        api.cart().catch(() => ({ items: [] })),
      ]);
      setProfile(nextProfile);
      setCartCount(cart.items?.length ?? 0);
      setIsAuthenticated(true);
      if (nextProfile.language && isLanguage(nextProfile.language)) setLanguageState(nextProfile.language);
    } catch {
      setIsAuthenticated(false);
      setProfile(null);
      setCartCount(0);
      await setAuthToken(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.logout();
    clearRegisterDraft();
    try {
      await AsyncStorage.removeItem('vaksinamed-cart-price-snap');
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    setProfile(null);
    setCartCount(0);
  };

  useEffect(() => {
    void AsyncStorage.getItem('soglom-language').then((value) => {
      if (isLanguage(value)) setLanguageState(value);
    });
    void refresh();
  }, []);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    void AsyncStorage.setItem('soglom-language', nextLanguage);
    if (isAuthenticated) void api.setLanguage(nextLanguage);
  };

  const redeemReward = async (reward: Reward) => {
    try {
      await api.redeem(reward.id);
      await refresh();
      return true;
    } catch {
      return false;
    }
  };

  const value = useMemo<AppContextValue>(() => ({
    language,
    setLanguage,
    t: (key: string) => dictionary[language][key] ?? dictionary.uz[key] ?? key,
    loading,
    isAuthenticated,
    // balance = getAuthoritativeBalance (spendable cashback). Never invent money.
    balance: profile != null && Number.isFinite(Number(profile.balance)) ? Number(profile.balance) : 0,
    user: {
      // Empty when unknown — screens must not invent demo names/tiers.
      name: [profile?.firstName, profile?.lastName].filter(Boolean).join(' '),
      phone: profile?.phone ? String(profile.phone) : '',
      tier: profile?.tier != null && String(profile.tier).trim() ? String(profile.tier).trim() : '',
      purchases: profile != null && Number.isFinite(Number(profile.purchasesCount))
        ? Math.max(0, Math.floor(Number(profile.purchasesCount)))
        : 0,
      total: profile != null && Number.isFinite(Number(profile.totalPurchases))
        ? Math.max(0, Math.floor(Number(profile.totalPurchases)))
        : 0,
      // savedAmount = cumulative saved field (NOT spendable balance). Do not treat as wallet.
      saved: profile != null && Number.isFinite(Number(profile.savedAmount))
        ? Math.max(0, Math.floor(Number(profile.savedAmount)))
        : 0,
      qrCode: profile?.qrCode ? String(profile.qrCode) : '',
    },
    transactions: Array.isArray(profile?.transactions)
      ? profile.transactions.map((item: any) => ({
          id: String(item?.id ?? ''),
          date: item?.date != null ? String(item.date) : '',
          title: item?.title != null ? String(item.title) : '',
          branch: item?.branch != null ? String(item.branch) : '',
          amount: Number(item?.amount) || 0,
          cashback: Number(item?.cashback) || 0,
          kind: item?.kind === 'use' ? 'use' : item?.kind === 'void' ? 'void' : 'earn',
        }))
      : [],
    rewards: profile?.rewards ?? [],
    redeemedRewards: profile?.redeemedRewards ?? [],
    cartCount,
    refresh,
    syncCartCount: (count: number) => {
      setCartCount(Math.max(0, Math.floor(Number(count) || 0)));
    },
    logout,
    redeemReward,
  }), [profile?.balance, language, loading, cartCount, profile, isAuthenticated]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
