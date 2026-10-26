import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
const MUTED = '#6B7280';
const BG = '#F8F9FD';
const CARD = '#FFFFFF';
const BORDER = '#EEF0F6';
const GREEN = '#059669';
const AMBER = '#D97706';
const BLUE = '#2563EB';
const ROSE = '#E11D48';

const READ_STORAGE_KEY = 'vaksinamed_read_notifs';
const CLEARED_STORAGE_KEY = 'vaksinamed_cleared_notifs';

type NotifCategory = 'all' | 'orders' | 'reminders' | 'cashback' | 'promos';

interface NotificationItem {
  id: string;
  category: NotifCategory;
  title: string;
  codeBadge?: string;
  body: string;
  rawTime: string;
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
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [menuVisible, setMenuVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = React.useRef<any>(null);

  const [orders, setOrders] = useState<any[]>([]);
  const [reminderDoses, setReminderDoses] = useState<any[]>([]);
  const [refillAlerts, setRefillAlerts] = useState<any[]>([]);
  const [cashbackRows, setCashbackRows] = useState<any[]>([]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  }, []);

  // Load read status & cleared status from local storage
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

    AsyncStorage.getItem(CLEARED_STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            setClearedIds(new Set(parsed));
          }
        } catch {}
      }
    });

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
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

  const mealRelationLabel = useCallback(
    (meal?: string) => {
      switch (meal) {
        case 'before_meal':
          return t('reminders.beforeMeal');
        case 'with_meal':
          return t('reminders.withMeal');
        case 'after_meal':
          return t('reminders.afterMeal');
        default:
          return t('reminders.independent');
      }
    },
    [t],
  );

  const formatTimeAgo = useCallback(
    (dateStr?: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return '';

      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear();

      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const timePart = `${hh}:${mm}`;

      if (isToday) return `${t('profile.notifToday')}, ${timePart}`;
      if (isYesterday) return `${t('profile.notifYesterday')}, ${timePart}`;

      return fmt.date(d, { withYear: false, withTime: true });
    },
    [t, fmt],
  );

  // Assemble dynamic notifications from real entities
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];
    const pushIfNotCleared = (item: NotificationItem) => {
      if (!clearedIds.has(item.id)) {
        list.push(item);
      }
    };

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
        pushIfNotCleared({
          id,
          category: 'orders',
          title: t('profile.notifOrderCompletedTitle'),
          codeBadge: `#${code}`,
          body: ord.canRate
            ? t('profile.notifOrderCompletedBody')
            : t('orders.alreadyRatedNote'),
          rawTime: ord.createdAt || new Date().toISOString(),
          icon: 'check-circle-outline',
          iconColor: GREEN,
          iconBg: '#ECFDF5',
          route: ord.canRate ? '/rating' : `/order/${ord.id}`,
          params: ord.canRate ? { orderId: String(ord.id) } : undefined,
          isRead: readIds.has(id),
        });
      } else if (isCancelled) {
        const id = `order-cancelled-${ord.id}`;
        pushIfNotCleared({
          id,
          category: 'orders',
          title: t('profile.notifOrderCancelledTitle'),
          codeBadge: `#${code}`,
          body: t('profile.notifOrderCancelledBody'),
          rawTime: ord.createdAt || new Date().toISOString(),
          icon: 'close-circle-outline',
          iconColor: ROSE,
          iconBg: '#FFE4E6',
          route: `/order/${ord.id}`,
          isRead: readIds.has(id),
        });
      } else if (isReady) {
        const id = `order-ready-${ord.id}`;
        pushIfNotCleared({
          id,
          category: 'orders',
          title: t('profile.notifOrderReadyTitle'),
          codeBadge: `#${code}`,
          body: t('profile.notifOrderReadyBody'),
          rawTime: ord.createdAt || new Date().toISOString(),
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
      pushIfNotCleared({
        id,
        category: 'reminders',
        title: t('profile.notifReminderStockTitle'),
        body: t('profile.notifReminderStockBody', { name: ref.medicineName, days: ref.daysRemaining }),
        rawTime: new Date().toISOString(),
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
      const doseDesc = [
        dose.medicineName,
        dose.dosage,
        dose.time,
        mealRelationLabel(dose.mealRelation),
      ]
        .filter(Boolean)
        .join(' · ');

      pushIfNotCleared({
        id,
        category: 'reminders',
        title: t('profile.notifReminderDoseTitle'),
        codeBadge: dose.time,
        body: doseDesc,
        rawTime: new Date().toISOString(),
        icon: 'pill',
        iconColor: BLUE,
        iconBg: '#DBEAFE',
        route: '/reminders',
        isRead: readIds.has(id),
      });
    }

    // 4. Cashback transactions (deduplicated by ID)
    const seenCashback = new Set<string>();
    for (const cb of cashbackRows) {
      const key = `${cb.id || cb.createdAt}-${cb.cashback || cb.amount}`;
      if (seenCashback.has(key)) continue;
      seenCashback.add(key);

      const id = `cashback-${cb.id || cb.createdAt}`;
      const amount = Number(cb.cashback || cb.amount || 0);
      if (amount > 0) {
        pushIfNotCleared({
          id,
          category: 'cashback',
          title: t('profile.notifCashbackEarnedTitle'),
          codeBadge: `+${fmt.money(amount)}`,
          body: t('profile.notifCashbackEarnedBody', { amount: fmt.money(amount) }),
          rawTime: cb.createdAt || new Date().toISOString(),
          icon: 'star-four-points-outline',
          iconColor: '#D97706',
          iconBg: '#FEF3C7',
          route: '/cashback',
          isRead: readIds.has(id),
        });
      }
    }

    // 5. System Welcome / 24h Promo notification
    const welcomeId = 'promo-welcome-2026';
    pushIfNotCleared({
      id: welcomeId,
      category: 'promos',
      title: t('profile.notifPromoWelcomeTitle'),
      codeBadge: '24/7',
      body: t('profile.notifPromoWelcomeBody'),
      rawTime: '2026-10-23T12:00:00.000Z',
      icon: 'gift-outline',
      iconColor: PURPLE,
      iconBg: '#F3E8FF',
      route: '/branches',
      isRead: readIds.has(welcomeId),
    });

    return list;
  }, [orders, refillAlerts, reminderDoses, cashbackRows, readIds, clearedIds, t, fmt, mealRelationLabel]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const countFor = useCallback(
    (cat: NotifCategory) => {
      if (cat === 'all') return notifications.length;
      return notifications.filter((n) => n.category === cat).length;
    },
    [notifications],
  );

  const handleMarkAllRead = async () => {
    const allIds = new Set(readIds);
    notifications.forEach((n) => allIds.add(n.id));
    setReadIds(allIds);
    await AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(allIds)));
    setMenuVisible(false);
    showToast(t('profile.notifToastAllRead'));
  };

  const handleClearRead = async () => {
    const readItems = notifications.filter((n) => n.isRead).map((n) => n.id);
    if (readItems.length === 0) {
      setMenuVisible(false);
      return;
    }
    const nextCleared = new Set(clearedIds);
    readItems.forEach((id) => nextCleared.add(id));
    setClearedIds(nextCleared);
    await AsyncStorage.setItem(CLEARED_STORAGE_KEY, JSON.stringify(Array.from(nextCleared)));
    setMenuVisible(false);
    showToast(t('profile.notifToastCleared'));
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

        <Pressable
          onPress={() => setMenuVisible(true)}
          style={styles.moreBtn}
          accessibilityRole="button"
          accessibilityLabel={t('profile.notifActionsA11y')}
        >
          <Feather name="more-vertical" size={20} color={PURPLE_DEEP} />
          {unreadCount > 0 ? <View style={styles.moreUnreadDot} /> : null}
        </Pressable>
      </View>

      {/* Horizontal Filter Tabs Strip */}
      <View style={styles.tabsStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const count = countFor(tab.key);
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
                {count > 0 ? (
                  <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                    <Text style={[styles.countBadgeText, active && styles.countBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                ) : null}
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
                  pressed && { opacity: 0.96, transform: [{ scale: 0.992 }] },
                ]}
                accessibilityRole="button"
              >
                {/* Accent strip on left for unread */}
                {!item.isRead ? <View style={styles.unreadLeftBar} /> : null}

                <View style={[styles.notifIconWrap, { backgroundColor: item.iconBg }]}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={22}
                    color={item.iconColor}
                  />
                </View>

                <View style={styles.notifCopy}>
                  {/* Top row: Title + Time / Dot */}
                  <View style={styles.notifTopRow}>
                    <View style={styles.titleWrap}>
                      <Text style={styles.notifTitle}>
                        {item.title}
                      </Text>
                      {item.codeBadge ? (
                        <View style={styles.codePill}>
                          <Text style={styles.codePillText}>{item.codeBadge}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.timeWrap}>
                      <Text style={styles.timeText}>{formatTimeAgo(item.rawTime)}</Text>
                      {!item.isRead ? <View style={styles.notifDot} /> : null}
                    </View>
                  </View>

                  {/* Body description */}
                  <Text style={styles.notifBody} numberOfLines={3}>
                    {item.body}
                  </Text>
                </View>

                <Feather name="chevron-right" size={16} color="#CBD5E1" style={{ marginLeft: 2 }} />
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

      {/* Action Menu Bottom Sheet */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          />
          <View style={[styles.bottomSheetCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('profile.notifMenuTitle')}</Text>
              <Pressable
                onPress={() => setMenuVisible(false)}
                hitSlop={10}
                style={styles.sheetCloseBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Feather name="x" size={18} color={MUTED} />
              </Pressable>
            </View>

            <View style={styles.sheetActionsList}>
              {/* Action 1: Mark all as read */}
              <Pressable
                onPress={handleMarkAllRead}
                style={({ pressed }) => [
                  styles.sheetActionItem,
                  pressed && styles.sheetActionItemPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.notifMarkAllRead')}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#F3E8FF' }]}>
                  <MaterialCommunityIcons name="check-all" size={22} color={PURPLE} />
                </View>
                <View style={styles.sheetActionTextWrap}>
                  <Text style={styles.sheetActionTitle}>{t('profile.notifMarkAllRead')}</Text>
                  <Text style={styles.sheetActionDesc}>{t('profile.notifMarkAllReadDesc')}</Text>
                </View>
                {unreadCount === 0 ? (
                  <Feather name="check" size={18} color={GREEN} />
                ) : (
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                )}
              </Pressable>

              <View style={styles.sheetDivider} />

              {/* Action 2: Clear read notifications */}
              <Pressable
                onPress={handleClearRead}
                style={({ pressed }) => [
                  styles.sheetActionItem,
                  pressed && styles.sheetActionItemPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.notifClearRead')}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#FFE4E6' }]}>
                  <Feather name="trash-2" size={20} color={ROSE} />
                </View>
                <View style={styles.sheetActionTextWrap}>
                  <Text style={[styles.sheetActionTitle, { color: ROSE }]}>
                    {t('profile.notifClearRead')}
                  </Text>
                  <Text style={styles.sheetActionDesc}>{t('profile.notifClearReadDesc')}</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Cancel button */}
            <Pressable
              onPress={() => setMenuVisible(false)}
              style={styles.sheetCancelBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Floating Toast Notification */}
      {toastMessage ? (
        <View style={[styles.toastWrap, { bottom: Math.max(insets.bottom, 20) + 16 }]} pointerEvents="none">
          <View style={styles.toastCard}>
            <Feather name="check-circle" size={18} color="#10B981" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}
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
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5FA',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  moreUnreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PURPLE,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  bottomSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8F9FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionsList: {
    paddingVertical: 4,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    gap: 12,
  },
  sheetActionItemPressed: {
    backgroundColor: '#F8F9FD',
  },
  sheetActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionTextWrap: {
    flex: 1,
  },
  sheetActionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
    marginBottom: 2,
  },
  sheetActionDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  sheetCancelBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#475569',
  },
  toastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: '100%',
  },
  toastText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  tabsStrip: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
    paddingVertical: 10,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingRight: 20,
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  tabChipActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  tabChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#4B5563',
  },
  tabChipTextActive: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    color: '#4B5563',
  },
  countBadgeTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
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
    alignItems: 'flex-start',
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F5',
    padding: 13,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  notifCardUnread: {
    borderColor: '#E9D5FF',
    backgroundColor: '#FFFFFF',
  },
  unreadLeftBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
    backgroundColor: PURPLE,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  notifIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notifCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  notifTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13.5,
    color: PURPLE_DEEP,
    lineHeight: 18,
  },
  codePill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  codePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    color: '#4B5563',
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 1,
  },
  timeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#9CA3AF',
  },
  notifDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: PURPLE,
  },
  notifBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
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
