import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getAuthToken, setAuthToken, setSessionEnded, telegramIdentity, type ApiError } from '@/lib/api';
import { createT, setCurrentLanguage, type TFunction } from '@/lib/i18n';
import { createFormatters, type Formatters } from '@/lib/i18n/format';
import { clearRegisterDraft } from '@/lib/registerDraft';
import { decideProfileLanguage, DEFAULT_LANGUAGE, parseStoredLanguage } from '@/lib/languagePreference';
import type { Language } from '@/lib/languages';
import { LANGUAGE_STORAGE_KEY, performLogout } from '@/lib/session';

export type { Language };
export type Transaction = {
  id: string;
  date: string;
  title: string;
  branch: string;
  amount: number;
  cashback: number;
  /** Display kind — void = REVERSAL / cheque cancel (not EARN). */
  kind: 'earn' | 'use' | 'void';
  /** SoT fields (optional — present when history is source-aware). */
  entryType?: string;
  createdAt?: string;
  sourceType?: 'ORDER' | 'POS' | 'SYSTEM' | 'FOM_POS' | null;
  sourceKey?: string | null;
  sourceLabel?: string;
  sourceContract?: 'CONTRACT_PENDING';
  orderId?: number | null;
  orderCode?: string | null;
  receiptId?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  commercialTransactionId?: number | null;
};
export type Reward = {
  id: string;
  title: string;
  subtitle: string;
  points: number;
  icon: string;
  accent: string;
};

type AppContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TFunction;
  /** Language-aware money/number/date formatters. */
  fmt: Formatters;
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
  /** Ends the customer session locally (always) and server-side (when reachable). Keeps the language. */
  logout: () => Promise<void>;
  redeemReward: (reward: Reward) => Promise<boolean>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [languageReady, setLanguageReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [cartCount, setCartCount] = useState(0);
  const languageRef = useRef<Language>(DEFAULT_LANGUAGE);
  const hasLocalLanguageRef = useRef(false);
  const languageLoadRef = useRef<Promise<void> | null>(null);
  /** Incremented on logout so in-flight refreshes cannot resurrect a closed session. */
  const sessionEpochRef = useRef(0);

  const applyLanguage = useCallback((next: Language) => {
    languageRef.current = next;
    setCurrentLanguage(next);
    setLanguageState(next);
  }, []);

  const loadStoredLanguage = useCallback(() => {
    if (!languageLoadRef.current) {
      languageLoadRef.current = AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
        .then((value) => {
          const stored = parseStoredLanguage(value);
          if (stored) {
            hasLocalLanguageRef.current = true;
            applyLanguage(stored);
          }
        })
        .catch(() => undefined)
        .finally(() => setLanguageReady(true));
    }
    return languageLoadRef.current;
  }, [applyLanguage]);

  const clearSessionState = useCallback(() => {
    setIsAuthenticated(false);
    setProfile(null);
    setCartCount(0);
  }, []);

  const refresh = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    try {
      await loadStoredLanguage();
      const token = await getAuthToken();
      const tg = await telegramIdentity();
      if (!token && !tg) {
        clearSessionState();
        return;
      }
      const [nextProfile, cart] = await Promise.all([
        api.profile(),
        api.cart().catch(() => ({ items: [] })),
      ]);
      if (epoch !== sessionEpochRef.current) return;
      setProfile(nextProfile);
      setCartCount(cart.items?.length ?? 0);
      setIsAuthenticated(true);
      const decision = decideProfileLanguage({
        local: languageRef.current,
        hasLocalPreference: hasLocalLanguageRef.current,
        server: nextProfile?.language,
      });
      if (decision.push) void api.setLanguage(decision.push).catch(() => undefined);
      if (decision.adopt) {
        hasLocalLanguageRef.current = true;
        applyLanguage(decision.adopt);
        void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, decision.adopt).catch(() => undefined);
      }
    } catch (err) {
      if (epoch !== sessionEpochRef.current) return;
      clearSessionState();
      const status = (err as ApiError | undefined)?.status;
      if (status === 401) await setAuthToken(null).catch(() => undefined);
    } finally {
      setSessionReady(true);
    }
  }, [applyLanguage, clearSessionState, loadStoredLanguage]);

  const logout = useCallback(async () => {
    sessionEpochRef.current += 1;
    await performLogout({
      revoke: () => api.revokeSession(),
      clearToken: () => setAuthToken(null),
      markSessionEnded: () => setSessionEnded(true),
      removeItem: (key) => AsyncStorage.removeItem(key),
      clearMemory: () => {
        clearRegisterDraft();
        clearSessionState();
      },
    });
  }, [clearSessionState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    hasLocalLanguageRef.current = true;
    applyLanguage(nextLanguage);
    void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage).catch(() => undefined);
    if (isAuthenticated) void api.setLanguage(nextLanguage).catch(() => undefined);
  }, [applyLanguage, isAuthenticated]);

  const redeemReward = useCallback(async (reward: Reward) => {
    try {
      await api.redeem(reward.id);
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  const syncCartCount = useCallback((count: number) => {
    setCartCount(Math.max(0, Math.floor(Number(count) || 0)));
  }, []);

  const t = useMemo(() => createT(language), [language]);
  const fmt = useMemo(() => createFormatters(language), [language]);
  const loading = !languageReady || !sessionReady;

  const value = useMemo<AppContextValue>(() => ({
    language,
    setLanguage,
    t,
    fmt,
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
      ? profile.transactions.map((item: any) => {
          const sourceTypeRaw = item?.sourceType != null ? String(item.sourceType).toUpperCase() : '';
          const sourceType =
            sourceTypeRaw === 'ORDER' ||
            sourceTypeRaw === 'POS' ||
            sourceTypeRaw === 'SYSTEM' ||
            sourceTypeRaw === 'FOM_POS'
              ? (sourceTypeRaw as Transaction['sourceType'])
              : item?.sourceType === null
                ? null
                : undefined;
          const branchName =
            item?.branchName != null && String(item.branchName).trim()
              ? String(item.branchName).trim()
              : item?.branch != null && String(item.branch).trim()
                ? String(item.branch).trim()
                : '';
          return {
            id: String(item?.id ?? item?.ledgerId ?? ''),
            date: item?.date != null ? String(item.date) : item?.createdAt != null ? String(item.createdAt).slice(0, 10) : '',
            title: item?.title != null ? String(item.title) : '',
            branch: branchName,
            amount: Number(item?.amount) || 0,
            cashback: Number(item?.cashback) || 0,
            kind: item?.kind === 'use' ? 'use' : item?.kind === 'void' ? 'void' : 'earn',
            entryType: item?.entryType != null ? String(item.entryType) : undefined,
            createdAt: item?.createdAt != null ? String(item.createdAt) : undefined,
            sourceType,
            sourceKey: item?.sourceKey != null ? String(item.sourceKey) : item?.sourceKey === null ? null : undefined,
            sourceLabel: item?.sourceLabel != null ? String(item.sourceLabel) : undefined,
            sourceContract: item?.sourceContract === 'CONTRACT_PENDING' ? 'CONTRACT_PENDING' : undefined,
            orderId:
              item?.orderId != null && Number.isFinite(Number(item.orderId))
                ? Number(item.orderId)
                : item?.orderId === null
                  ? null
                  : undefined,
            orderCode: item?.orderCode != null ? String(item.orderCode) : item?.orderCode === null ? null : undefined,
            receiptId: item?.receiptId != null ? String(item.receiptId) : item?.receiptId === null ? null : undefined,
            branchId:
              item?.branchId != null && Number.isFinite(Number(item.branchId))
                ? Number(item.branchId)
                : item?.branchId === null
                  ? null
                  : undefined,
            branchName: branchName || null,
            commercialTransactionId:
              item?.commercialTransactionId != null && Number.isFinite(Number(item.commercialTransactionId))
                ? Number(item.commercialTransactionId)
                : item?.commercialTransactionId === null
                  ? null
                  : undefined,
          } satisfies Transaction;
        })
      : [],
    rewards: profile?.rewards ?? [],
    redeemedRewards: profile?.redeemedRewards ?? [],
    cartCount,
    refresh,
    syncCartCount,
    logout,
    redeemReward,
  }), [profile, language, t, fmt, loading, cartCount, isAuthenticated, refresh, setLanguage, syncCartCount, logout, redeemReward]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
