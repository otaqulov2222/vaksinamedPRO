import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'uz' | 'ru' | 'en';
export type Transaction = {
  id: string;
  date: string;
  title: string;
  branch: string;
  amount: number;
  cashback: number;
  kind: 'earn' | 'use';
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
    home: 'Bosh sahifa',
    cashback: 'Cashback',
    bonuses: 'Bonuslar',
    purchases: 'Xaridlar',
    profile: 'Profil',
    hello: 'Salom',
    welcome: 'Har bir xarid — ko‘proq imkoniyat',
    balance: 'Mening balansim',
    spend: 'Cashback ishlatish',
    history: 'Tarix',
    purchasesCount: 'Xaridlar',
    saved: 'Tejalgan summa',
    level: 'Daraja',
    gold: 'Gold daraja',
    nextLevel: 'Keyingi darajagacha',
    points: 'ball',
    quickAccess: 'Tezkor xizmatlar',
    myQr: 'Mening QR kodim',
    branches: 'Aptekalar',
    offers: 'Aksiyalar',
    invite: 'Do‘st taklif qilish',
    nearby: 'Eng yaqin apteka',
    openNow: 'Ochiq',
    details: 'Batafsil',
    all: 'Barchasi',
    available: 'Mavjud',
    earned: 'To‘plangan',
    used: 'Ishlatilgan',
    noData: 'Hozircha ma’lumot yo‘q',
    redeem: 'Almashtirish',
    redeemed: 'Almashtirildi',
    profileInfo: 'Profil ma’lumotlari',
    settings: 'Sozlamalar',
    language: 'Til',
    notifications: 'Bildirishnomalar',
    help: 'Yordam markazi',
    about: 'Ilova haqida',
    logout: 'Chiqish',
    chooseLanguage: 'Tilni tanlang',
    uzbek: 'O‘zbekcha',
    russian: 'Русский',
    english: 'English',
    rating: 'Xodimni baholash',
    send: 'Yuborish',
    thankYou: 'Fikringiz uchun rahmat',
    selectRating: 'Xizmatni qanday baholaysiz?',
    branchAddress: 'Toshkent sh., Amir Temur ko‘chasi, 42',
    workingHours: 'Har kuni 08:00 — 22:00',
  },
  ru: {
    home: 'Главная',
    cashback: 'Кэшбэк',
    bonuses: 'Бонусы',
    purchases: 'Покупки',
    profile: 'Профиль',
    hello: 'Здравствуйте',
    welcome: 'Каждая покупка — больше возможностей',
    balance: 'Мой баланс',
    spend: 'Потратить кэшбэк',
    history: 'История',
    purchasesCount: 'Покупки',
    saved: 'Сэкономлено',
    level: 'Уровень',
    gold: 'Золотой уровень',
    nextLevel: 'До следующего уровня',
    points: 'баллов',
    quickAccess: 'Быстрые сервисы',
    myQr: 'Мой QR-код',
    branches: 'Аптеки',
    offers: 'Акции',
    invite: 'Пригласить друга',
    nearby: 'Ближайшая аптека',
    openNow: 'Открыто',
    details: 'Подробнее',
    all: 'Все',
    available: 'Доступные',
    earned: 'Начисления',
    used: 'Списания',
    noData: 'Пока нет данных',
    redeem: 'Обменять',
    redeemed: 'Обменено',
    profileInfo: 'Данные профиля',
    settings: 'Настройки',
    language: 'Язык',
    notifications: 'Уведомления',
    help: 'Центр помощи',
    about: 'О приложении',
    logout: 'Выйти',
    chooseLanguage: 'Выберите язык',
    uzbek: 'O‘zbekcha',
    russian: 'Русский',
    english: 'English',
    rating: 'Оценить сотрудника',
    send: 'Отправить',
    thankYou: 'Спасибо за отзыв',
    selectRating: 'Как вы оцениваете сервис?',
    branchAddress: 'г. Ташкент, ул. Амир Темур, 42',
    workingHours: 'Ежедневно 08:00 — 22:00',
  },
  en: {
    home: 'Home',
    cashback: 'Cashback',
    bonuses: 'Bonuses',
    purchases: 'Purchases',
    profile: 'Profile',
    hello: 'Hello',
    welcome: 'Every purchase brings more value',
    balance: 'My balance',
    spend: 'Use cashback',
    history: 'History',
    purchasesCount: 'Purchases',
    saved: 'You saved',
    level: 'Level',
    gold: 'Gold level',
    nextLevel: 'Until next level',
    points: 'points',
    quickAccess: 'Quick services',
    myQr: 'My QR code',
    branches: 'Pharmacies',
    offers: 'Offers',
    invite: 'Invite a friend',
    nearby: 'Nearest pharmacy',
    openNow: 'Open',
    details: 'Details',
    all: 'All',
    available: 'Available',
    earned: 'Earned',
    used: 'Used',
    noData: 'Nothing here yet',
    redeem: 'Redeem',
    redeemed: 'Redeemed',
    profileInfo: 'Profile information',
    settings: 'Settings',
    language: 'Language',
    notifications: 'Notifications',
    help: 'Help center',
    about: 'About the app',
    logout: 'Log out',
    chooseLanguage: 'Choose a language',
    uzbek: 'O‘zbekcha',
    russian: 'Русский',
    english: 'English',
    rating: 'Rate an employee',
    send: 'Send',
    thankYou: 'Thank you for your feedback',
    selectRating: 'How would you rate the service?',
    branchAddress: '42 Amir Temur Street, Tashkent',
    workingHours: 'Every day 08:00 — 22:00',
  },
};

const initialTransactions: Transaction[] = [
  { id: '10582', date: '18.09.2026', title: 'Vitaminlar va parvarish', branch: 'Sog‘lom apteka №12', amount: 500000, cashback: 25000, kind: 'earn' },
  { id: '10321', date: '15.09.2026', title: 'Oilaviy xarid', branch: 'Sog‘lom apteka №12', amount: 300000, cashback: 20000, kind: 'use' },
  { id: '9981', date: '10.09.2026', title: 'Dori vositalari', branch: 'Sog‘lom apteka №7', amount: 420000, cashback: 15000, kind: 'earn' },
  { id: '9834', date: '04.09.2026', title: 'Kosmetika', branch: 'Sog‘lom apteka №12', amount: 275000, cashback: 9000, kind: 'earn' },
];

const rewards: Reward[] = [
  { id: 'discount', title: 'Barcha mahsulotlarga 10% chegirma', subtitle: 'Keyingi xaridingizda', points: 500, icon: 'percent', accent: '#e1f6e8' },
  { id: 'vitamin', title: 'Vitamin D3', subtitle: '60 kapsula', points: 1000, icon: 'pill', accent: '#fff2d5' },
  { id: 'bag', title: 'Kosmetichka', subtitle: 'Vaksina Med', points: 1500, icon: 'shopping', accent: '#f1e7f7' },
  { id: 'thermos', title: 'Termos', subtitle: 'Vaksina Med', points: 2000, icon: 'coffee', accent: '#fff1c9' },
];

type AppContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  balance: number;
  user: { name: string; phone: string; tier: string; purchases: number; total: number; saved: number };
  transactions: Transaction[];
  rewards: Reward[];
  redeemedRewards: string[];
  redeemReward: (reward: Reward) => boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>('uz');
  const [balance, setBalance] = useState(125500);
  const [redeemedRewards, setRedeemedRewards] = useState<string[]>([]);

  useEffect(() => {
    void AsyncStorage.multiGet(['soglom-language', 'soglom-redeemed']).then((entries) => {
      const savedLanguage = entries[0][1] as Language | null;
      const savedRewards = entries[1][1];
      if (savedLanguage && ['uz', 'ru', 'en'].includes(savedLanguage)) setLanguageState(savedLanguage);
      if (savedRewards) setRedeemedRewards(JSON.parse(savedRewards) as string[]);
    });
  }, []);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    void AsyncStorage.setItem('soglom-language', nextLanguage);
  };

  const redeemReward = (reward: Reward) => {
    if (redeemedRewards.includes(reward.id) || balance < reward.points) return false;
    const next = [...redeemedRewards, reward.id];
    setRedeemedRewards(next);
    setBalance((current) => current - reward.points);
    void AsyncStorage.setItem('soglom-redeemed', JSON.stringify(next));
    return true;
  };

  const value = useMemo<AppContextValue>(() => ({
    language,
    setLanguage,
    t: (key: string) => dictionary[language][key] ?? dictionary.uz[key] ?? key,
    balance,
    user: { name: 'Saidmuhammad Alixonov', phone: '+998 90 123 45 67', tier: 'Gold', purchases: 18, total: 4850000, saved: 125500 },
    transactions: initialTransactions,
    rewards,
    redeemedRewards,
    redeemReward,
  }), [balance, language, redeemedRewards]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}