import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { notify } from '../lib/dialogs';
import { localizedName } from '../lib/i18n/data';

const PURPLE = '#6C38CC';
const PURPLE_DEEP = '#1C025D';
const TEXT_MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const CARD_BG = '#FFFFFF';
const BG = '#F8F9FD';
const KEY_ENTER = 'Enter'; // i18n-ignore

export interface ChatProductItem {
  id: number;
  sku: string;
  nameUz: string;
  nameRu: string;
  category: string;
  manufacturer: string;
  price: number;
  unit: string;
  requiresPrescription: boolean;
  analogGroup?: string;
  inStock: boolean;
  dosage?: string;
  instructions?: string;
  confidence?: number;
  cheaperAlternative?: {
    id: number;
    nameUz: string;
    nameRu: string;
    price: number;
    manufacturer: string;
    difference: number;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  timestamp: string;
  isPrescription?: boolean;
  matchedProducts?: ChatProductItem[];
  quickSuggestions?: string[];
}

function renderFormattedMessageText(text: string, isUser: boolean) {
  if (!text.includes('**')) {
    return text;
  }
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const clean = part.slice(2, -2);
      return (
        <Text
          key={`bold-${index}`}
          style={[styles.msgTextBold, isUser ? styles.msgTextBoldUser : styles.msgTextBoldAssistant]}
        >
          {clean}
        </Text>
      );
    }
    return part;
  });
}

export default function PrescriptionScreen() {
  const insets = useSafeAreaInsets();
  const { t, fmt, language, refresh } = useApp();
  const scrollViewRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [addingAll, setAddingAll] = useState(false);

  // Initialize with AI Welcome Message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome-msg',
          sender: 'assistant',
          text: t('catalog.aiChatWelcome'),
          timestamp: fmt.time(new Date()),
          quickSuggestions: [
            t('catalog.aiChatQuickPrompt1'),
            t('catalog.aiChatQuickPrompt2'),
            t('catalog.aiChatQuickPrompt3'),
            t('catalog.aiChatQuickPrompt4'),
          ],
        },
      ]);
    }
  }, [t]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }, []);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/catalog');
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'assistant',
        text: t('catalog.aiChatWelcome'),
        timestamp: fmt.time(new Date()),
        quickSuggestions: [
          t('catalog.aiChatQuickPrompt1'),
          t('catalog.aiChatQuickPrompt2'),
          t('catalog.aiChatQuickPrompt3'),
          t('catalog.aiChatQuickPrompt4'),
        ],
      },
    ]);
    setAttachedImage(null);
    setInputText('');
  };

  const handleCamera = async () => {
    setAttachSheetVisible(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify(t('catalog.aiChatTitle'), t('catalog.prescriptionCamera'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        setAttachedImage({
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 ? `data:image/jpeg;base64,${result.assets[0].base64}` : undefined,
        });
      }
    } catch {
      handleDemoSample();
    }
  };

  const handleGallery = async () => {
    setAttachSheetVisible(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(t('catalog.aiChatTitle'), t('catalog.prescriptionGallery'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        setAttachedImage({
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 ? `data:image/jpeg;base64,${result.assets[0].base64}` : undefined,
        });
      }
    } catch {
      handleDemoSample();
    }
  };

  const handleDemoSample = () => {
    setAttachSheetVisible(false);
    setInputText('Rp: Tab. Paratsetamol 500 mg #10\nRp: Tab. Amoksitsillin 500 mg #20\nRp: Vitamin D3 2000 IU');
  };

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend != null ? textToSend : inputText;
    const trimmed = rawText.trim();
    if (!trimmed && !attachedImage) return;

    const userMsgId = `user-${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: trimmed,
      imageUri: attachedImage?.uri,
      timestamp: fmt.time(new Date()),
    };

    const imagePayload = attachedImage?.base64 || (attachedImage ? 'demo_scan_image' : undefined);

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
    setAttachedImage(null);
    setSending(true);
    scrollToBottom();

    try {
      const res = await api.aiPrescriptionChat({
        message: trimmed,
        image: imagePayload,
        language,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: res.reply || t('catalog.prescriptionEmpty'),
        timestamp: fmt.time(new Date()),
        isPrescription: Boolean(res.isPrescription),
        matchedProducts: res.matchedProducts || [],
        quickSuggestions: res.quickSuggestions || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: `assistant-err-${Date.now()}`,
        sender: 'assistant',
        text: t('catalog.prescriptionEmpty'),
        timestamp: fmt.time(new Date()),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  const handleAddToCart = async (prod: ChatProductItem) => {
    const key = String(prod.id);
    if (addedIds[key]) return;
    try {
      await api.addToCart(prod.id, 1);
      await refresh();
      setAddedIds((prev) => ({ ...prev, [key]: true }));
      notify(t('common.navCart'), t('catalog.addedToCartShort'));
    } catch {
      notify(t('common.navCart'), t('catalog.addToCartFailed'));
    }
  };

  const handleAddAllToCart = async (productsToAdd: ChatProductItem[]) => {
    if (addingAll || productsToAdd.length === 0) return;
    setAddingAll(true);
    try {
      for (const prod of productsToAdd) {
        await api.addToCart(prod.id, 1);
        setAddedIds((prev) => ({ ...prev, [String(prod.id)]: true }));
      }
      await refresh();
      notify(t('common.navCart'), t('catalog.aiChatAddedToast'));
      router.push('/cart');
    } catch {
      notify(t('common.navCart'), t('catalog.addToCartFailed'));
    } finally {
      setAddingAll(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('catalog.backToCatalog')}
        >
          <Feather name="arrow-left" size={22} color={PURPLE_DEEP} />
        </Pressable>

        <View style={styles.headerIdentity}>
          <View style={styles.avatarWrap}>
            <MaterialCommunityIcons name="robot" size={22} color="#FFFFFF" />
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.headerTextWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {t('catalog.aiChatTitle')}
              </Text>
              <View style={styles.aiBadge}>
                {/* i18n-ignore */}
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            </View>
            <View style={styles.headerSubRow}>
              <Text style={styles.headerSubRole} numberOfLines={1}>
                {t('catalog.aiChatSubtitle')}
              </Text>
              <Text style={styles.headerSubDot}>•</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDotSmall} />
                <Text style={styles.headerSubOnline}>
                  {t('catalog.aiChatOnline')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleResetChat}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('catalog.aiChatResetBtn')}
        >
          <Feather name="edit-3" size={18} color={PURPLE_DEEP} />
        </Pressable>
      </View>

      {/* CHAT MESSAGES STREAM */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.chatStream, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* CLINICAL SAFETY DISCLAIMER BANNER */}
        <View style={styles.medicalNoticeBanner}>
          <MaterialCommunityIcons name="shield-alert" size={18} color="#B45309" style={styles.medicalNoticeIcon} />
          <Text style={styles.medicalNoticeText}>
            {(() => {
              const full = t('catalog.aiChatDisclaimer');
              const colonIdx = full.indexOf(':');
              if (colonIdx !== -1) {
                const title = full.slice(0, colonIdx + 1);
                const rest = full.slice(colonIdx + 1);
                return (
                  <>
                    <Text style={styles.medicalNoticeTitle}>{title}</Text>
                    {rest}
                  </>
                );
              }
              return full;
            })()}
          </Text>
        </View>

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <View
              key={msg.id}
              style={[
                styles.messageRow,
                isUser ? styles.messageRowUser : styles.messageRowAssistant,
              ]}
            >
              {!isUser && (
                <View style={styles.assistantBubbleAvatar}>
                  <MaterialCommunityIcons name="pill" size={16} color="#FFFFFF" />
                </View>
              )}

              <View
                style={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
              >
                {/* User Attached Image Preview inside bubble */}
                {msg.imageUri ? (
                  <View style={styles.msgImageWrap}>
                    <Image
                      source={{ uri: msg.imageUri }}
                      style={styles.msgImage}
                      resizeMode="cover"
                    />
                    <View style={styles.rxAttachedTag}>
                      <MaterialCommunityIcons name="file-document-outline" size={13} color="#FFFFFF" />
                      <Text style={styles.rxAttachedTagText}>{t('catalog.prescriptionTitle')}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Message Text */}
                {Boolean(msg.text) && (
                  <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextAssistant]}>
                    {renderFormattedMessageText(msg.text, isUser)}
                  </Text>
                )}

                {/* Matched Products Cards (AI Medical Vision Results) */}
                {msg.matchedProducts && msg.matchedProducts.length > 0 ? (
                  <View style={styles.productsList}>
                    {msg.matchedProducts.map((prod) => {
                      const name = localizedName(language, prod);
                      const isAdded = Boolean(addedIds[String(prod.id)]);
                      return (
                        <View key={`match-${prod.id}`} style={styles.productCard}>
                          <View style={styles.productTopRow}>
                            <View style={styles.productIconBox}>
                              <MaterialCommunityIcons name="pill" size={22} color={PURPLE} />
                            </View>
                            <View style={styles.productInfoCol}>
                              <View style={styles.productBadgeRow}>
                                <View style={styles.confidenceBadge}>
                                  <Feather name="check" size={10} color="#059669" />
                                  <Text style={styles.confidenceText}>
                                    {prod.confidence
                                      ? t('catalog.prescriptionConfidence', { score: prod.confidence })
                                      : t('catalog.inStockBranch')}
                                  </Text>
                                </View>
                                {prod.requiresPrescription && (
                                  <View style={styles.rxBadge}>
                                    <Text style={styles.rxBadgeText}>{t('catalog.rxShort')}</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.productName} numberOfLines={2}>
                                {name}
                              </Text>
                              {Boolean(prod.dosage) && (
                                <Text style={styles.dosageNote} numberOfLines={1}>
                                  {prod.dosage}
                                </Text>
                              )}
                              <Text style={styles.manufacturerNote} numberOfLines={1}>
                                {prod.manufacturer}
                              </Text>
                            </View>
                          </View>

                          {/* Cheaper Alternative Suggestion */}
                          {prod.cheaperAlternative ? (
                            <View style={styles.alternativeBox}>
                              <MaterialCommunityIcons name="swap-horizontal" size={15} color="#059669" />
                              <Text style={styles.alternativeText} numberOfLines={1}>
                                {t('catalog.prescriptionCheaperAnalog', {
                                  name: localizedName(language, prod.cheaperAlternative),
                                  price: fmt.money(prod.cheaperAlternative.price),
                                })}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.productActionRow}>
                            <Text style={styles.productPrice}>{fmt.money(prod.price)}</Text>
                            <Pressable
                              style={({ pressed }) => [
                                styles.addCartBtn,
                                isAdded && styles.addCartBtnSuccess,
                                pressed && styles.pressed,
                              ]}
                              onPress={() => handleAddToCart(prod)}
                            >
                              <Feather name={isAdded ? 'check' : 'plus'} size={15} color="#FFFFFF" />
                              <Text style={styles.addCartBtnText}>
                                {isAdded ? t('catalog.itemAdded') : t('common.navCart')}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}

                    {/* Bulk Add All To Cart (ONLY for prescriptions with 2+ items) */}
                    {Boolean(msg.isPrescription && (msg.matchedProducts?.length ?? 0) > 1) && (
                      <Pressable
                        style={({ pressed }) => [styles.addAllBtn, pressed && styles.pressed]}
                        onPress={() => handleAddAllToCart(msg.matchedProducts!)}
                        disabled={addingAll}
                      >
                        {addingAll ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Feather name="shopping-bag" size={16} color="#FFFFFF" />
                            <Text style={styles.addAllBtnText}>{t('catalog.aiChatAddAll')}</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                ) : null}

                {/* Quick Suggestions Chips */}
                {msg.quickSuggestions && msg.quickSuggestions.length > 0 ? (
                  <View style={styles.suggestionsContainer}>
                    {msg.quickSuggestions.map((suggestion, sIdx) => (
                      <Pressable
                        key={`sug-${sIdx}`}
                        style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}
                        onPress={() => {
                          if (sIdx === 0 && suggestion.toLowerCase().includes('retsept')) {
                            setAttachSheetVisible(true);
                          } else {
                            handleSendMessage(suggestion);
                          }
                        }}
                      >
                        <Text style={styles.suggestionChipText}>{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Text style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampAssistant]}>
                  {msg.timestamp}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Typing indicator */}
        {sending && (
          <View style={[styles.messageRow, styles.messageRowAssistant]}>
            <View style={styles.assistantBubbleAvatar}>
              <MaterialCommunityIcons name="pill" size={16} color="#FFFFFF" />
            </View>
            <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
              <ActivityIndicator size="small" color={PURPLE} />
              <Text style={styles.typingText}>{t('catalog.aiChatTyping')}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* BOTTOM INPUT BAR */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={[styles.inputBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
          {/* Attached image preview banner */}
          {attachedImage ? (
            <View style={styles.attachedPreviewBar}>
              <Image source={{ uri: attachedImage.uri }} style={styles.attachedThumb} resizeMode="cover" />
              <View style={styles.attachedMeta}>
                <Text style={styles.attachedTitle} numberOfLines={1}>
                  {t('catalog.aiChatAttachPrompt')}
                </Text>
                <Text style={styles.attachedSub}>{t('catalog.prescriptionScanAction')}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.removeAttachBtn, pressed && styles.pressed]}
                onPress={() => setAttachedImage(null)}
                hitSlop={8}
              >
                <Feather name="x" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputControlsRow}>
            {/* Attachment Button */}
            <Pressable
              style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]}
              onPress={() => setAttachSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('catalog.aiChatAttachPrompt')}
            >
              <Feather name="plus-circle" size={24} color={PURPLE} />
            </Pressable>

            {/* Text Input with Enter to send on Web */}
            <TextInput
              style={styles.chatInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={t('catalog.aiChatPlaceholder')}
              placeholderTextColor={TEXT_MUTED}
              maxLength={400}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                handleSendMessage();
              }}
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent?.key === KEY_ENTER && !e.nativeEvent?.shiftKey) {
                  e.preventDefault?.();
                  handleSendMessage();
                }
              }}
              // @ts-ignore - React Native Web passes onKeyDown to input
              onKeyDown={(e: any) => {
                if (e.key === KEY_ENTER && !e.shiftKey) {
                  e.preventDefault?.();
                  handleSendMessage();
                }
              }}
            />

            {/* Send Button */}
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                (!inputText.trim() && !attachedImage) ? styles.sendBtnDisabled : null,
                pressed && styles.pressed,
              ]}
              onPress={() => handleSendMessage()}
              disabled={(!inputText.trim() && !attachedImage) || sending}
            >
              <Feather name="arrow-up" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ATTACHMENT MODAL SHEET */}
      <Modal
        visible={attachSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachSheetVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAttachSheetVisible(false)}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('catalog.aiChatAttachPrompt')}</Text>

            <Pressable
              style={({ pressed }) => [styles.sheetActionItem, pressed && styles.pressed]}
              onPress={handleCamera}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: '#EDE9FE' }]}>
                <MaterialCommunityIcons name="camera-outline" size={24} color={PURPLE} />
              </View>
              <View style={styles.sheetActionMeta}>
                <Text style={styles.sheetActionTitle}>{t('catalog.aiChatCameraOption')}</Text>
                <Text style={styles.sheetActionSub}>{t('catalog.prescriptionSubtitle')}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetActionItem, pressed && styles.pressed]}
              onPress={handleGallery}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialCommunityIcons name="image-outline" size={24} color="#D97706" />
              </View>
              <View style={styles.sheetActionMeta}>
                <Text style={styles.sheetActionTitle}>{t('catalog.aiChatGalleryOption')}</Text>
                <Text style={styles.sheetActionSub}>{t('catalog.prescriptionSubtitle')}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetActionItem, pressed && styles.pressed]}
              onPress={handleDemoSample}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: '#D1FAE5' }]}>
                <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#059669" />
              </View>
              <View style={styles.sheetActionMeta}>
                <Text style={styles.sheetActionTitle}>{t('catalog.aiChatDemoOption')}</Text>
                <Text style={styles.sheetActionSub}>{t('catalog.prescriptionSamplePrompt')}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  pressed: {
    opacity: 0.82,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' },
    }),
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    gap: 10,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: PURPLE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 3 },
      web: { boxShadow: '0 2px 8px rgba(108, 56, 204, 0.25)' },
    }),
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15.5,
    lineHeight: 19,
    color: '#0F172A',
  },
  aiBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  aiBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    color: PURPLE,
    letterSpacing: 0.3,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerSubRole: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    lineHeight: 15,
    color: '#64748B',
  },
  headerSubDot: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
  },
  onlineDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  headerSubOnline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
    color: '#059669',
  },

  // CHAT STREAM
  chatStream: {
    padding: 16,
    gap: 16,
  },
  medicalNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 9,
  },
  medicalNoticeIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  medicalNoticeText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: '#92400E',
  },
  medicalNoticeTitle: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    color: '#78350F',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  assistantBubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: 18,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#1A1040', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 8px rgba(26, 16, 64, 0.05)' },
    }),
  },
  bubbleUser: {
    backgroundColor: PURPLE,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: CARD_BG,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextBold: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  msgTextBoldUser: {
    color: '#FFFFFF',
  },
  msgTextBoldAssistant: {
    color: '#1C025D',
  },
  msgTextUser: {
    fontFamily: 'Inter_500Medium',
    color: '#FFFFFF',
  },
  msgTextAssistant: {
    fontFamily: 'Inter_400Regular',
    color: '#1E1B4B',
  },
  timestamp: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 6,
  },
  timestampUser: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  timestampAssistant: {
    color: '#9CA3AF',
  },

  // USER ATTACHED IMAGE IN BUBBLE
  msgImageWrap: {
    width: 220,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
  },
  msgImage: {
    width: '100%',
    height: '100%',
  },
  rxAttachedTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rxAttachedTagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
  },

  // TYPING
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  typingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    color: TEXT_MUTED,
  },

  // MATCHED PRODUCTS LIST (AI CARDS)
  productsList: {
    marginTop: 12,
    gap: 10,
  },
  productCard: {
    backgroundColor: '#F8F7FC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  productTopRow: {
    flexDirection: 'row',
    gap: 10,
  },
  productIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfoCol: {
    flex: 1,
  },
  productBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confidenceText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    color: '#059669',
  },
  rxBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rxBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    color: '#DC2626',
  },
  productName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    lineHeight: 18,
    color: PURPLE_DEEP,
  },
  dosageNote: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: PURPLE,
    marginTop: 2,
  },
  manufacturerNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  alternativeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  alternativeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#047857',
    flex: 1,
  },
  productActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECEAF2',
  },
  productPrice: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14.5,
    color: PURPLE_DEEP,
  },
  addCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addCartBtnSuccess: {
    backgroundColor: '#059669',
  },
  addCartBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  addAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PURPLE_DEEP,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  addAllBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },

  // QUICK SUGGESTIONS
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  suggestionChip: {
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  suggestionChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: PURPLE,
  },

  // BOTTOM INPUT BAR
  inputBar: {
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: '#ECEAF2',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  attachedPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8F7FC',
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  attachedThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  attachedMeta: {
    flex: 1,
  },
  attachedTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12.5,
    color: PURPLE_DEEP,
  },
  attachedSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: TEXT_MUTED,
  },
  removeAttachBtn: {
    padding: 6,
  },
  inputControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8F7FC',
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: PURPLE_DEEP,
    borderWidth: 1,
    borderColor: '#ECEAF2',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: '#C4B5FD',
    shadowOpacity: 0,
    elevation: 0,
  },

  // MODAL SHEET
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: PURPLE_DEEP,
    marginBottom: 4,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F8F7FC',
    gap: 12,
  },
  sheetActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionMeta: {
    flex: 1,
  },
  sheetActionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: PURPLE_DEEP,
  },
  sheetActionSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
});
