import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';

const PURPLE = '#6A22D6';
const PURPLE_DEEP = '#1A1040';
const MUTED = '#8B93A7';
const BG = '#F7F8FC';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const GREEN = '#10B981';
const AMBER = '#F59E0B';
const BLUE = '#2563EB';

const READ_STORAGE_KEY = 'vaksinamed_read_notifs';

type NotifCategory = 'all' | 'orders' | 'reminders' | 'cashback' | 'promos';

interface NotificationItem {
  id: string;
  category: NotifCategory;
  title: string;
  body: string;
  time: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  route?: string;
  params?: Record<string, string>;
  isRead: boolean;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, fmt } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<NotifCategory>('all');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const [orders, setOrders] = useState<any[]>([]);
  const [reminderDoses, setReminderDoses] = useState<any[]>([]);
  const [refillAlerts, setRefillAlerts] = useState<any[]>([]);
  const [cashbackRows, setCashbackRows] = useState<any[]>([]);

  // Load read status from storage
  useEffect(() => {
    AsyncStorage.getItem(READ_STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            setReadIds(new Set(parsed));
          }
        } catch {}
      }
    });
  }, []);

  const loadData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const [ordersRes, remindersRes, refillRes, cashbackRes] = await Promise.allSettled([
        api.orders(),
        api.reminders(),
        api.refillAlerts(),
        api.cashbackHistory({ limit: 10 }),
      ]);

      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value?.orders)) {
        setOrders(ordersRes.value.orders);
      }
      if (remindersRes.status === 'fulfilled') {
        const doses = remindersRes.value?.schedule || [];
        setReminderDoses(doses);
      }
      if (refillRes.status === 'fulfilled' && Array.isArray(refillRes.value?.alerts)) {
        setRefillAlerts(refillRes.value.alerts);
      }
      if (cashbackRes.status === 'fulfilled' && Array.isArray(cashbackRes.value?.items)) {
        setCashbackRows(cashbackRes.value.items);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Assemble dynamic notifications from real entities
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];

    // 1. Orders
    for (const ord of orders) {
      const code = String(ord.code || ord.id);
      const isCompleted =
        ord.fulfillmentStatus === 'COMPLETED' || String(ord.status).toLowerCase() === 'completed';
      const isCancelled =
        ord.fulfillmentStatus === 'CANCELLED' || String(ord.status).toLowerCase() === 'cancelled';
      const isReady =
        ord.fulfillmentStatus === 'READY_FOR_PICKUP' ||
        ord.fulfillmentStatus === 'CONFIRMED' ||
        ord.status === 'confirmed';

      if (isCompleted) {
        const id = `order-completed-${ord.id}`;
        list.push({
          id,
          category: 'orders',
          title: t('profile.notifOrderCompletedTitle', { code }),
          body: ord.canRate
            ? t('profile.notifOrderCompletedBody')
            : t('orders.alreadyRatedNote'),
          time: ord.createdAt || new Date().toISOString(),
          icon: 'check-circle-outline',
          iconColor: GREEN,
          iconBg: '#DCFCE7',
          route: ord.canRate ? '/rating' : `/order/${ord.id}`,
          params: ord.canRate ? { orderId: String(ord.id) } : undefined,
          isRead: readIds.has(id),
        });
      } else if (isCancelled) {
        const id = `order-cancelled-${ord.id}`;
        list.push({
          id,
          category: 'orders',
          title: t('profile.notifOrderCancelledTitle', { code }),
          body: t('profile.notifOrderCancelledBody'),
          time: ord.createdAt || new Date().toISOString(),
          icon: 'close-circle-outline',
          iconColor: '#DC2626',
          iconBg: '#FEE2E2',
          route: `/order/${ord.id}`,
          isRead: readIds.has(id),
        });
      } else if (isReady) {
        const id = `order-ready-${ord.id}`;
        list.push({
          id,
          category: 'orders',
          title: t('profile.notifOrderReadyTitle', { code }),
          body: t('profile.notifOrderReadyBody'),
          time: ord.createdAt || new Date().toISOString(),
          icon: 'package-variant-closed',
          iconColor: PURPLE,
          iconBg: '#F3E8FF',
          route: `/order/${ord.id}`,
          isRead: readIds.has(id),
        });
      }
    }

    // 2. Refill alerts
    for (const ref of refillAlerts) {
      const id = `refill-${ref.reminderId || ref.medicineName}`;
      list.push({
        id,
        category: 'reminders',
        title: t('profile.notifReminderStockTitle'),
        body: t('profile.notifReminderStockBody', { name: ref.medicineName, days: ref.daysRemaining }),
        time: new Date().toISOString(),
        icon: 'alert-decagram-outline',
        iconColor: AMBER,
        iconBg: '#FEF3C7',
        route: '/reminders',
        isRead: readIds.has(id),
      });
    }

    // 3. Medication doses today
    for (const dose of reminderDoses.slice(0, 3)) {
      const id = `dose-${dose.doseId || dose.reminderId}-${dose.time}`;
      const doseDesc = [dose.medicineName, dose.dosage, dose.time, dose.mealRelation].filter(Boolean).join(' · ');
      list.push({
        id,
        category: 'reminders',
        title: t('profile.notifReminderDoseTitle'),
        body: doseDesc,
        time: new Date().toISOString(),
        icon: 'pill',
        iconColor: BLUE,
        iconBg: '#DBEAFE',
        route: '/reminders',
        isRead: readIds.has(id),
      });
    }

    // 4. Cashback transactions
    for (const cb of cashbackRows.slice(0, 3)) {
      const id = `cashback-${cb.id || cb.createdAt}`;
      const amount = Number(cb.cashback || cb.amount || 0);
      if (amount > 0) {
        list.push({
          id,
          category: 'cashback',
          title: t('profile.notifCashbackEarnedTitle'),
          body: t('profile.notifCashbackEarnedBody', { amount: fmt.money(amount) }),
          time: cb.createdAt || new Date().toISOString(),
          icon: 'star-four-points-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
          route: '/cashback',
          isRead: readIds.has(id),
        });
      }
    }

    // 5. System Welcome / Promo notification
    const welcomeId = 'promo-welcome-2026';
    list.push({
      id: welcomeId,
      category: 'promos',
      title: t('profile.notifPromoWelcomeTitle'),
      body: t('profile.notifPromoWelcomeBody'),
      time: '2026-10-23T12:00:00.000Z',
      icon: 'gift-outline',
      iconColor: PURPLE,
      iconBg: '#F3E8FF',
      route: '/branches',
      isRead: readIds.has(welcomeId),
    });

    return list;
  }, [orders, refillAlerts, reminderDoses, cashbackRows, readIds, t, fmt]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const markAllAsRead = async () => {
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    await AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(allIds)));
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    if (!item.isRead) {
      const next = new Set(readIds);
      next.add(item.id);
      setReadIds(next);
      await AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(next)));
    }

    if (item.route) {
      if (item.params) {
        router.push({ pathname: item.route as any, params: item.params });
      } else {
        router.push(item.route as any);
      }
    }
  };

  const TABS: { key: NotifCategory; labelKey: string }[] = [
    { key: 'all', labelKey: 'profile.notifTabAll' },
    { key: 'orders', labelKey: 'profile.notifTabOrders' },
    { key: 'reminders', labelKey: 'profile.notifTabReminders' },
    { key: 'cashback', labelKey: 'profile.notifTabCashback' },
    { key: 'promos', labelKey: 'profile.notifTabPromos' },
  ];

  return (
    <View style={styles.pageRoot}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('orders.backToOrdersA11y')}
        >
          <Feather name="arrow-left" size={20} color={PURPLE_DEEP} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.headerTitle}>{t('common.navNotifications')}</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.headerSubtitle}>{t('profile.notifSubtitle')}</Text>
        </View>

        {unreadCount > 0 ? (
          <Pressable
            onPress={markAllAsRead}
            style={styles.markReadBtn}
            accessibilityRole="button"
            accessibilityLabel={t('profile.notifMarkAllRead')}
          >
            <Feather name="check" size={16} color={PURPLE} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs Strip */}
      <View style={styles.tabsStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabChip, active && styles.tabChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                  {t(tab.labelKey as any)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Notifications List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={PURPLE} size="large" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadData(true)}
              tintColor={PURPLE}
              colors={[PURPLE]}
            />
          }
        >
          {filteredNotifications.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="bell-off" size={32} color={MUTED} />
              </View>
              <Text style={styles.emptyTitle}>{t('profile.notifEmptyFilterTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('profile.notifEmptyFilterBody')}</Text>
            </View>
          ) : (
            filteredNotifications.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleNotificationPress(item)}
                style={({ pressed }) => [
                  styles.notifCard,
                  !item.isRead && styles.notifCardUnread,
                  pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
                ]}
                accessibilityRole="button"
              >
                <View style={[styles.notifIconWrap, { backgroundColor: item.iconBg }]}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={22}
                    color={item.iconColor}
                  />
                </View>

                <View style={styles.notifCopy}>
                  <View style={styles.notifTopRow}>
                    <Text style={styles.notifTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {!item.isRead ? <View style={styles.notifDot} /> : null}
                  </View>
                  <Text style={styles.notifBody} numberOfLines={2}>
                    {item.body}
                  </Text>
                </View>

                <Feather name="chevron-right" size={16} color="#CBD5E1" />
              </Pressable>
            ))
          )}

          {/* Quick Shortcuts Section */}
          <View style={styles.shortcutsCard}>
            <Text style={styles.shortcutsTitle}>{t('profile.notifNowTitle')}</Text>

            <Pressable
              style={styles.shortcutRow}
              onPress={() => router.push('/(tabs)/purchases')}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: '#F3E8FF' }]}>
                <MaterialCommunityIcons name="package-variant" size={18} color={PURPLE} />
              </View>
              <Text style={styles.shortcutText}>{t('profile.notifLinkOrders')}</Text>
              <Feather name="chevron-right" size={16} color="#CBD5E1" />
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={styles.shortcutRow}
              onPress={() => router.push('/reminders')}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: '#DBEAFE' }]}>
                <MaterialCommunityIcons name="pill" size={18} color={BLUE} />
              </View>
              <Text style={styles.shortcutText}>{t('reminders.title')}</Text>
              <Feather name="chevron-right" size={16} color="#CBD5E1" />
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={styles.shortcutRow}
              onPress={() => router.push('/cashback')}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialCommunityIcons name="wallet-outline" size={18} color="#D97706" />
              </View>
              <Text style={styles.shortcutText}>{t('profile.notifLinkCashback')}</Text>
              <Feather name="chevron-right" size={16} color="#CBD5E1" />
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: BG,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: PURPLE_DEEP,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 1,
  },
  unreadBadge: {
    backgroundColor: PURPLE,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  markReadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsStrip: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
    paddingVertical: 8,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  tabChipActive: {
    backgroundColor: PURPLE,
  },
  tabChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: '#4B5563',
  },
  tabChipTextActive: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    padding: 14,
    gap: 12,
  },
  notifCardUnread: {
    borderColor: '#D8B4FE',
    backgroundColor: '#FAF7FE',
  },
  notifIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    color: PURPLE_DEEP,
    flex: 1,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PURPLE,
  },
  notifBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    lineHeight: 16,
  },
  emptyState: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 17,
  },
  shortcutsCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE7F6',
    padding: 14,
    marginTop: 8,
    gap: 4,
  },
  shortcutsTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE_DEEP,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: PURPLE_DEEP,
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F0F0F5',
  },
});
