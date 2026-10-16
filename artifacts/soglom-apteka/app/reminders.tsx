import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialogs';

const PURPLE = '#6C38CC';
const PURPLE_DEEP = '#1C025D';
const CARD_BG = '#FFFFFF';
const BG = '#F8F9FD';
const BORDER = '#E5E7EB';
const MUTED = '#6B7280';
const GREEN = '#10B981';
const AMBER = '#F59E0B';

interface ScheduledDose {
  doseId: string;
  reminderId: number;
  medicineName: string;
  dosage: string;
  mealRelation: string;
  time: string;
  memberTag: string;
  customMemberName: string | null;
  currentStock: number;
  packageSize: number;
  productId: number | null;
  instructions: string;
  status: 'taken' | 'skipped' | 'snoozed' | 'pending';
  logId?: number;
  actionTime?: string;
}

interface ReminderItem {
  id: number;
  medicineName: string;
  dosage: string;
  mealRelation: string;
  intakeTimes: string[];
  startDate: string;
  endDate: string | null;
  durationDays: number | null;
  currentStock: number;
  packageSize: number;
  lowStockThreshold: number;
  memberTag: string;
  customMemberName: string | null;
  instructions: string;
  isActive: boolean;
}

interface RefillAlert {
  reminderId: number;
  medicineName: string;
  currentStock: number;
  lowStockThreshold: number;
  dosesPerDay: number;
  daysRemaining: number;
  productId: number | null;
  product: any;
  availableInStock: boolean;
}

function formatDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const PRESET_TIMES = ['08:00', '13:00', '19:00', '22:00'];

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { t, language, fmt, syncCartCount } = useApp();

  const params = useLocalSearchParams<{
    medicineName?: string;
    dosage?: string;
    productId?: string;
  }>();

  const [selectedDate, setSelectedDate] = useState<string>(() => formatDateYMD(new Date()));
  const [activeTab, setActiveTab] = useState<'today' | 'all'>('today');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schedule, setSchedule] = useState<ScheduledDose[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [compliance, setCompliance] = useState({ totalDoses: 0, takenDoses: 0, skippedDoses: 0, pendingDoses: 0, percent: 100 });
  const [refillAlerts, setRefillAlerts] = useState<RefillAlert[]>([]);
  const [refillingId, setRefillingId] = useState<number | null>(null);
  const [takingId, setTakingId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [formProductId, setFormProductId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formDosage, setFormDosage] = useState('1 tabletka');
  const [formMeal, setFormMeal] = useState<string>('after_meal');
  const [formTimes, setFormTimes] = useState<string[]>(['08:00']);
  const [formStock, setFormStock] = useState('30');
  const [formPkg, setFormPkg] = useState('30');
  const [formThreshold, setFormThreshold] = useState('5');
  const [formMember, setFormMember] = useState('myself');
  const [formCustomMember, setFormCustomMember] = useState('');
  const [formInstructions, setFormInstructions] = useState('');

  useEffect(() => {
    if (params.medicineName) {
      setFormName(String(params.medicineName));
      if (params.dosage) setFormDosage(String(params.dosage));
      if (params.productId) setFormProductId(Number(params.productId) || null);
      setIsModalOpen(true);
    }
  }, [params.medicineName, params.dosage, params.productId]);

  // Generate 7 days around today
  const dateStrip = useMemo(() => {
    const today = new Date();
    const days: Array<{ ymd: string; dayNumber: number; isToday: boolean; label: string }> = [];
    for (let i = -1; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const ymd = formatDateYMD(d);
      const dayNumber = d.getDate();
      const isToday = i === 0;
      const label = fmt.weekdayShort(d);
      days.push({ ymd, dayNumber, isToday, label });
    }
    return days;
  }, [fmt]);

  const loadData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const [scheduleRes, alertsRes] = await Promise.all([
        api.reminders({ date: selectedDate }),
        api.refillAlerts().catch(() => ({ count: 0, alerts: [] })),
      ]);

      setSchedule(scheduleRes.schedule || []);
      setReminders(scheduleRes.reminders || []);
      setCompliance(scheduleRes.todayCompliance || { totalDoses: 0, takenDoses: 0, skippedDoses: 0, pendingDoses: 0, percent: 100 });
      setRefillAlerts(alertsRes.alerts || []);
    } catch {
      // non-fatal in offline
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTakeDose = async (dose: ScheduledDose, status: 'taken' | 'skipped') => {
    setTakingId(dose.doseId);
    try {
      await api.takeMedication(dose.reminderId, {
        scheduledDate: selectedDate,
        scheduledTime: dose.time,
        status,
      });
      notify(t('reminders.takeSuccess'), 'success');
      loadData();
    } catch (err: any) {
      notify(err.message || t('common.errorGeneric'), 'error');
    } finally {
      setTakingId(null);
    }
  };

  const handleRefillToCart = async (reminderId: number) => {
    setRefillingId(reminderId);
    try {
      const res = await api.refillReminderToCart(reminderId);
      if (res.cartCount != null) {
        syncCartCount(res.cartCount);
      }
      notify(t('reminders.refillSuccess', { name: res.productName }), 'success');
      loadData();
    } catch (err: any) {
      notify(err.message || t('common.errorGeneric'), 'error');
    } finally {
      setRefillingId(null);
    }
  };

  const handleDeleteReminder = async (id: number) => {
    try {
      await api.deleteReminder(id);
      notify(t('reminders.deletedSuccess'), 'success');
      loadData();
    } catch (err: any) {
      notify(err.message || t('common.errorGeneric'), 'error');
    }
  };

  const handleSaveReminder = async () => {
    if (!formName.trim()) {
      notify(t('reminders.medicineNamePlaceholder'), 'warning');
      return;
    }
    if (formTimes.length === 0) {
      notify(t('reminders.timesLabel'), 'warning');
      return;
    }

    setModalSaving(true);
    try {
      await api.createReminder({
        medicineName: formName.trim(),
        productId: formProductId || undefined,
        dosage: formDosage.trim() || '1 tabletka',
        mealRelation: formMeal,
        intakeTimes: formTimes,
        startDate: selectedDate,
        currentStock: Number(formStock) || 30,
        packageSize: Number(formPkg) || 30,
        lowStockThreshold: Number(formThreshold) || 5,
        memberTag: formMember,
        customMemberName: formCustomMember.trim() || null,
        instructions: formInstructions.trim() || undefined,
        refillReminderEnabled: true,
      });
      notify(t('reminders.addedSuccess'), 'success');
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      notify(err.message || t('common.errorGeneric'), 'error');
    } finally {
      setModalSaving(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormProductId(null);
    setFormDosage('1 tabletka');
    setFormMeal('after_meal');
    setFormTimes(['08:00']);
    setFormStock('30');
    setFormPkg('30');
    setFormThreshold('5');
    setFormMember('myself');
    setFormCustomMember('');
    setFormInstructions('');
  };

  const toggleTimePreset = (timeStr: string) => {
    if (formTimes.includes(timeStr)) {
      if (formTimes.length > 1) {
        setFormTimes(formTimes.filter((t) => t !== timeStr));
      }
    } else {
      setFormTimes([...formTimes, timeStr].sort());
    }
  };

  const mealRelationLabel = (meal: string) => {
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
  };

  const memberTagLabel = (tag: string, custom?: string | null) => {
    if (custom && custom.trim()) return custom.trim();
    switch (tag) {
      case 'father':
        return t('reminders.father');
      case 'mother':
        return t('reminders.mother');
      case 'child':
        return t('reminders.child');
      case 'spouse':
        return t('reminders.spouse');
      case 'other':
        return t('reminders.other');
      default:
        return t('reminders.myself');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Feather name="arrow-left" size={22} color={PURPLE_DEEP} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('reminders.title')}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {t('reminders.subtitle')}
          </Text>
        </View>

        <Pressable
          onPress={() => setIsModalOpen(true)}
          style={({ pressed }) => [styles.addHeaderBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('reminders.addNew')}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={PURPLE} />}
      >
        {/* Date Selector Strip */}
        <View style={styles.dateStripWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
            {dateStrip.map((item) => {
              const selected = item.ymd === selectedDate;
              return (
                <Pressable
                  key={item.ymd}
                  onPress={() => setSelectedDate(item.ymd)}
                  style={[styles.dateCell, selected && styles.dateCellSelected]}
                >
                  <Text style={[styles.dateCellLabel, selected && styles.dateCellLabelSelected]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.dateCellNumber, selected && styles.dateCellNumberSelected]}>
                    {item.dayNumber}
                  </Text>
                  {item.isToday ? <View style={[styles.todayDot, selected && styles.todayDotSelected]} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Refill Alerts Banner (Auto-Refill trigger) */}
        {refillAlerts.length > 0 ? (
          <View style={styles.alertsContainer}>
            {refillAlerts.map((alert) => (
              <View key={`alert-${alert.reminderId}`} style={styles.alertCard}>
                <View style={styles.alertIconWrap}>
                  <MaterialCommunityIcons name="alert-decagram-outline" size={24} color={AMBER} />
                </View>
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle} numberOfLines={1}>
                    {t('reminders.refillTitle')}
                  </Text>
                  <Text style={styles.alertBody}>
                    {t('reminders.refillBody', {
                      name: alert.medicineName,
                      stock: alert.currentStock,
                      days: Math.max(1, alert.daysRemaining),
                    })}
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.refillBtn, pressed && styles.pressed]}
                    disabled={refillingId === alert.reminderId}
                    onPress={() => handleRefillToCart(alert.reminderId)}
                  >
                    {refillingId === alert.reminderId ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="cart-plus" size={16} color="#FFFFFF" />
                        <Text style={styles.refillBtnText}>{t('reminders.refillAction')}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Compliance & Adherence Card */}
        <View style={styles.complianceCard}>
          <View style={styles.complianceTop}>
            <View>
              <Text style={styles.complianceTitle}>
                {t('reminders.adherenceToday', {
                  taken: compliance.takenDoses,
                  total: compliance.totalDoses,
                })}
              </Text>
              <Text style={styles.complianceSub}>
                {compliance.percent === 100 && compliance.totalDoses > 0
                  ? t('reminders.allTaken')
                  : t('reminders.pendingDoses', { count: compliance.pendingDoses })}
              </Text>
            </View>
            <View style={styles.complianceBadge}>
              <Text style={styles.complianceBadgeText}>{compliance.percent}%</Text>
            </View>
          </View>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${compliance.percent}%` }]} />
          </View>
        </View>

        {/* Tabs: Today vs My Medicines */}
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab('today')}
            style={[styles.tabBtn, activeTab === 'today' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'today' && styles.tabBtnTextActive]}>
              {t('reminders.tabToday')} ({schedule.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('all')}
            style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>
              {t('reminders.tabMyMedicines')} ({reminders.length})
            </Text>
          </Pressable>
        </View>

        {/* Main Content Area */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={PURPLE} />
          </View>
        ) : activeTab === 'today' ? (
          /* Today's Schedule Timeline */
          schedule.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="calendar-clock" size={48} color="#C4B5FD" />
              <Text style={styles.emptyTitle}>{t('reminders.emptySchedule')}</Text>
              <Text style={styles.emptySub}>{t('reminders.emptyScheduleSub')}</Text>
              <Pressable
                style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.pressed]}
                onPress={() => setIsModalOpen(true)}
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>{t('reminders.addNew')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.scheduleList}>
              {schedule.map((dose) => {
                const isTaken = dose.status === 'taken';
                const isSkipped = dose.status === 'skipped';
                const isPending = dose.status === 'pending';

                return (
                  <View key={dose.doseId} style={[styles.doseCard, isTaken && styles.doseCardTaken]}>
                    <View style={styles.doseLeft}>
                      <View style={[styles.timeBox, isTaken && styles.timeBoxTaken]}>
                        <Text style={[styles.timeText, isTaken && styles.timeTextTaken]}>{dose.time}</Text>
                      </View>
                      <View style={styles.doseMetaCol}>
                        <Text style={[styles.doseName, isTaken && styles.doseNameTaken]} numberOfLines={1}>
                          {dose.medicineName}
                        </Text>
                        <View style={styles.tagsRow}>
                          <View style={styles.chipPill}>
                            <Text style={styles.chipText}>{dose.dosage}</Text>
                          </View>
                          <View style={styles.chipPill}>
                            <Text style={styles.chipText}>{mealRelationLabel(dose.mealRelation)}</Text>
                          </View>
                          {dose.memberTag !== 'myself' ? (
                            <View style={[styles.chipPill, styles.chipMember]}>
                              <Text style={styles.chipMemberText}>
                                {memberTagLabel(dose.memberTag, dose.customMemberName)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.stockCaption}>
                          {t('reminders.stockBadge', { stock: dose.currentStock })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.doseRight}>
                      {isTaken ? (
                        <View style={styles.statusBadgeTaken}>
                          <Feather name="check" size={14} color={GREEN} />
                          <Text style={styles.statusTextTaken}>{t('reminders.takenStatus')}</Text>
                        </View>
                      ) : isSkipped ? (
                        <View style={styles.statusBadgeSkipped}>
                          <Text style={styles.statusTextSkipped}>{t('reminders.skippedStatus')}</Text>
                        </View>
                      ) : (
                        <View style={styles.actionsCol}>
                          <Pressable
                            style={({ pressed }) => [styles.takeBtn, pressed && styles.pressed]}
                            disabled={takingId === dose.doseId}
                            onPress={() => handleTakeDose(dose, 'taken')}
                          >
                            {takingId === dose.doseId ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Feather name="check" size={14} color="#FFFFFF" />
                                <Text style={styles.takeBtnText}>{t('reminders.markTaken')}</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
                            disabled={takingId === dose.doseId}
                            onPress={() => handleTakeDose(dose, 'skipped')}
                          >
                            <Text style={styles.skipBtnText}>{t('reminders.markSkipped')}</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )
        ) : (
          /* All Medications List */
          reminders.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="pill" size={48} color="#C4B5FD" />
              <Text style={styles.emptyTitle}>{t('reminders.emptyMedicines')}</Text>
              <Pressable
                style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.pressed]}
                onPress={() => setIsModalOpen(true)}
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>{t('reminders.addNew')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.scheduleList}>
              {reminders.map((rem) => (
                <View key={`rem-${rem.id}`} style={styles.reminderCard}>
                  <View style={styles.remTopRow}>
                    <View style={styles.remTitleCol}>
                      <Text style={styles.remName}>{rem.medicineName}</Text>
                      <Text style={styles.remMeta}>
                        {rem.dosage} · {mealRelationLabel(rem.mealRelation)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteReminder(rem.id)}
                      style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </Pressable>
                  </View>

                  <View style={styles.remTimesRow}>
                    <Text style={styles.remTimesLabel}>{t('reminders.timesLabel')}:</Text>
                    {rem.intakeTimes.map((tm) => (
                      <View key={tm} style={styles.remTimeBadge}>
                        <Text style={styles.remTimeText}>{tm}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.remBottomRow}>
                    <View style={styles.stockProgressBox}>
                      <Text style={styles.stockProgressText}>
                        {t('reminders.stockBadge', { stock: rem.currentStock })}
                      </Text>
                      <View style={styles.stockTrack}>
                        <View
                          style={[
                            styles.stockFill,
                            {
                              width: `${Math.min(100, Math.round((rem.currentStock / Math.max(1, rem.packageSize)) * 100))}%`,
                              backgroundColor: rem.currentStock <= rem.lowStockThreshold ? AMBER : PURPLE,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={styles.memberTagBadge}>
                      <Text style={styles.memberTagText}>
                        {memberTagLabel(rem.memberTag, rem.customMemberName)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Add New Reminder Modal */}
      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(20, insets.bottom + 10) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('reminders.addNew')}</Text>
              <Pressable
                onPress={() => setIsModalOpen(false)}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
              >
                <Feather name="x" size={20} color={MUTED} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              {/* Medicine Name */}
              <Text style={styles.fieldLabel}>{t('reminders.medicineNameLabel')} *</Text>
              <TextInput
                style={styles.textInput}
                value={formName}
                onChangeText={setFormName}
                placeholder={t('reminders.medicineNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
              />

              {/* Dosage */}
              <Text style={styles.fieldLabel}>{t('reminders.dosageLabel')}</Text>
              <TextInput
                style={styles.textInput}
                value={formDosage}
                onChangeText={setFormDosage}
                placeholder={t('reminders.dosagePlaceholder')}
                placeholderTextColor="#9CA3AF"
              />

              {/* Intake Times Selection */}
              <Text style={styles.fieldLabel}>{t('reminders.timesLabel')} *</Text>
              <View style={styles.presetsRow}>
                {PRESET_TIMES.map((timeStr) => {
                  const isChecked = formTimes.includes(timeStr);
                  return (
                    <Pressable
                      key={timeStr}
                      onPress={() => toggleTimePreset(timeStr)}
                      style={[styles.presetChip, isChecked && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetChipText, isChecked && styles.presetChipTextActive]}>
                        {timeStr}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Meal Relation */}
              <Text style={styles.fieldLabel}>{t('reminders.mealRelationLabel')}</Text>
              <View style={styles.presetsRow}>
                {[
                  { key: 'after_meal', label: t('reminders.afterMeal') },
                  { key: 'before_meal', label: t('reminders.beforeMeal') },
                  { key: 'with_meal', label: t('reminders.withMeal') },
                  { key: 'independent', label: t('reminders.independent') },
                ].map((rel) => {
                  const active = formMeal === rel.key;
                  return (
                    <Pressable
                      key={rel.key}
                      onPress={() => setFormMeal(rel.key)}
                      style={[styles.presetChip, active && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                        {rel.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Stock and Package Size */}
              <View style={styles.dualRow}>
                <View style={styles.dualCol}>
                  <Text style={styles.fieldLabel}>{t('reminders.stockLabel')}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formStock}
                    onChangeText={setFormStock}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.dualCol}>
                  <Text style={styles.fieldLabel}>{t('reminders.lowStockThresholdLabel')}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formThreshold}
                    onChangeText={setFormThreshold}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* For Whom (Member Tag) */}
              <Text style={styles.fieldLabel}>{t('reminders.memberLabel')}</Text>
              <View style={styles.presetsRow}>
                {[
                  { key: 'myself', label: t('reminders.myself') },
                  { key: 'child', label: t('reminders.child') },
                  { key: 'father', label: t('reminders.father') },
                  { key: 'mother', label: t('reminders.mother') },
                  { key: 'spouse', label: t('reminders.spouse') },
                ].map((mem) => {
                  const active = formMember === mem.key;
                  return (
                    <Pressable
                      key={mem.key}
                      onPress={() => setFormMember(mem.key)}
                      style={[styles.presetChip, active && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                        {mem.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {formMember !== 'myself' ? (
                <TextInput
                  style={[styles.textInput, { marginTop: 6 }]}
                  value={formCustomMember}
                  onChangeText={setFormCustomMember}
                  placeholder={t('reminders.customNamePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                />
              ) : null}

              {/* Instructions */}
              <Text style={styles.fieldLabel}>{t('reminders.instructionsLabel')}</Text>
              <TextInput
                style={styles.textInput}
                value={formInstructions}
                onChangeText={setFormInstructions}
                placeholder={t('reminders.instructionsPlaceholder')}
                placeholderTextColor="#9CA3AF"
              />

              {/* Save Button */}
              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && styles.pressed]}
                disabled={modalSaving}
                onPress={handleSaveReminder}
              >
                {modalSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>{t('reminders.save')}</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 22,
    color: PURPLE_DEEP,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
    marginTop: 1,
  },
  addHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  dateStripWrap: { marginBottom: 14 },
  dateStrip: { gap: 8 },
  dateCell: {
    width: 50,
    height: 64,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dateCellSelected: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  dateCellLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
    textTransform: 'capitalize',
  },
  dateCellLabelSelected: { color: '#E9D5FF' },
  dateCellNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  dateCellNumberSelected: { color: '#FFFFFF' },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PURPLE,
    marginTop: 2,
  },
  todayDotSelected: { backgroundColor: '#FFFFFF' },

  alertsContainer: { marginBottom: 14, gap: 8 },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 10,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertContent: { flex: 1 },
  alertTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#92400E',
    marginBottom: 2,
  },
  alertBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: '#B45309',
    marginBottom: 8,
  },
  refillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 6,
  },
  refillBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },

  complianceCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  complianceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  complianceTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  complianceSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: MUTED,
    marginTop: 2,
  },
  complianceBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  complianceBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: PURPLE,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: GREEN,
  },

  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: CARD_BG,
  },
  tabBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: MUTED,
  },
  tabBtnTextActive: {
    fontFamily: 'Inter_700Bold',
    color: PURPLE_DEEP,
  },

  scheduleList: { gap: 10 },
  doseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  doseCardTaken: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    opacity: 0.9,
  },
  doseLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  timeBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBoxTaken: { backgroundColor: '#E5E7EB' },
  timeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: PURPLE,
  },
  timeTextTaken: { color: MUTED },
  doseMetaCol: { flex: 1 },
  doseName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  doseNameTaken: { textDecorationLine: 'line-through', color: MUTED },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chipPill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: '#4B5563',
  },
  chipMember: { backgroundColor: '#EDE9FE' },
  chipMemberText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: PURPLE,
  },
  stockCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: MUTED,
    marginTop: 4,
  },

  doseRight: { marginLeft: 10 },
  actionsCol: { gap: 6, alignItems: 'flex-end' },
  takeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GREEN,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  takeBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  statusBadgeTaken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTextTaken: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: GREEN,
  },
  statusBadgeSkipped: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTextSkipped: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
  },

  reminderCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  remTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  remTitleCol: { flex: 1 },
  remName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  remMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remTimesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  remTimesLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  remTimeBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  remTimeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: PURPLE,
  },
  remBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  stockProgressBox: { flex: 1, marginRight: 12 },
  stockProgressText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10.5,
    color: MUTED,
    marginBottom: 4,
  },
  stockTrack: {
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  stockFill: { height: '100%', borderRadius: 2 },
  memberTagBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  memberTagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    color: PURPLE,
  },

  centerBox: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: PURPLE_DEEP,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURPLE,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    marginTop: 6,
  },
  emptyAddBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: PURPLE_DEEP,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScroll: { padding: 20, gap: 12 },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: PURPLE_DEEP,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: PURPLE_DEEP,
  },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetChipActive: {
    backgroundColor: '#F3E8FF',
    borderColor: PURPLE,
  },
  presetChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: MUTED,
  },
  presetChipTextActive: {
    fontFamily: 'Inter_700Bold',
    color: PURPLE,
  },
  dualRow: { flexDirection: 'row', gap: 10 },
  dualCol: { flex: 1 },
  submitBtn: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
