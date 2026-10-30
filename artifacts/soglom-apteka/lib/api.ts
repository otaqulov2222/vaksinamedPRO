import AsyncStorage from '@react-native-async-storage/async-storage';
import { tr } from '@/lib/i18n';
import { NETWORK_ERROR_CODE } from '@/lib/i18n/errors';
import { SESSION_ENDED_KEY } from '@/lib/session';

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if ((host === 'localhost' || host === '127.0.0.1') && (!envUrl || envUrl.includes('vaksinamedgps.uz'))) {
      return `http://${host}:5000`;
    }
    if (window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
      return window.location.origin;
    }
  }
  return envUrl || 'https://api-staging.vaksinamedgps.uz';
}

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const base = resolveApiUrl();
  return `${base.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`;
}

const API_URL = resolveApiUrl();
const TOKEN_KEY = 'vaksinamed-customer-token';

let memoryToken: string | null = null;
/** null = not loaded yet. True after an explicit logout until the next successful login. */
let sessionEnded: boolean | null = null;

export async function getAuthToken() {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function setAuthToken(token: string | null) {
  memoryToken = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await setSessionEnded(false);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

async function isSessionEnded(): Promise<boolean> {
  if (sessionEnded != null) return sessionEnded;
  try {
    sessionEnded = (await AsyncStorage.getItem(SESSION_ENDED_KEY)) === '1';
  } catch {
    sessionEnded = false;
  }
  return sessionEnded;
}

export async function setSessionEnded(ended: boolean) {
  sessionEnded = ended;
  try {
    if (ended) await AsyncStorage.setItem(SESSION_ENDED_KEY, '1');
    else await AsyncStorage.removeItem(SESSION_ENDED_KEY);
  } catch {
    // in-memory flag still applies for this run
  }
}

function rawTelegramId() {
  if (typeof window !== 'undefined') {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    if (user?.id) return String(user.id);
  }
  return process.env.EXPO_PUBLIC_TELEGRAM_ID || '';
}

/** Telegram identity is ignored after an explicit logout so the user is not silently re-authenticated. */
export async function telegramIdentity(): Promise<string> {
  if (await isSessionEnded()) return '';
  return rawTelegramId();
}

export type ApiError = Error & { status?: number; code?: string };

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const tg = await telegramIdentity();
  if (tg) headers.set('x-telegram-id', tg);
  if (auth) {
    const token = await getAuthToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    const err = new Error(tr('common.errorNetwork')) as ApiError;
    err.code = NETWORK_ERROR_CODE;
    throw err;
  }
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const err = new Error(data?.message || `HTTP ${response.status}`) as ApiError;
    err.status = response.status;
    if (data?.code) err.code = String(data.code);
    throw err;
  }
  return data as T;
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const api = {
  register: async (body: { phone: string; password: string; firstName: string; lastName?: string }) => {
    const data = await request<any>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }, false);
    await setAuthToken(data.token);
    return data;
  },
  login: async (body: { phone: string; password: string }) => {
    const data = await request<any>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }, false);
    await setAuthToken(data.token);
    return data;
  },
  requestOtp: (phone: string, purpose: 'login' | 'register' = 'login') =>
    request<any>('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone, purpose }) }, false),
  verifyOtp: async (body: { phone: string; code: string; purpose?: 'login' | 'register'; firstName?: string; password?: string }) => {
    const data = await request<any>('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify(body) }, false);
    await setAuthToken(data.token);
    return data;
  },
  me: () => request<any>('/api/auth/me'),
  /** Revokes the current session server-side. Local cleanup is owned by performLogout. */
  revokeSession: () => request<{ ok: boolean; revoked: boolean }>('/api/auth/logout', { method: 'POST' }),
  profile: () => request<any>('/api/loyalty/profile'),
  updateProfile: (body: { firstName?: string; lastName?: string; language?: string }) =>
    request<any>('/api/loyalty/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword?: string; newPassword: string }) =>
    request<{ ok: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  resetPasswordWithOtp: (body: { code: string; newPassword: string }) =>
    request<{ ok: boolean; message: string }>('/api/auth/reset-password-with-otp', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  forgotPasswordReset: async (body: { phone: string; code: string; newPassword: string }) => {
    const data = await request<{ ok: boolean; token: string; customer: any; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }, false);
    if (data?.token) {
      await setAuthToken(data.token);
    }
    return data;
  },
  posCard: () => request<any>('/api/pos/card'),
  /** SoT cashback history (source-aware). Auth = session customer only. */
  cashbackHistory: (opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    const q = params.toString();
    return request<{ items: any[]; limit: number; offset: number }>(
      `/api/loyalty/cashback-history${q ? `?${q}` : ''}`,
    );
  },
  cashbackRules: () => request<any>('/api/cashback/rules', {}, false),
  setLanguage: (language: string) => request<any>('/api/loyalty/profile', { method: 'PATCH', body: JSON.stringify({ language }) }),
  redeem: (rewardId: string) => request<any>('/api/loyalty/redeem', { method: 'POST', body: JSON.stringify({ rewardId }) }),
  categories: () => request<{ categories: string[] }>('/api/catalog/categories'),
  products: (query = '') =>
    request<{
      products: any[];
      pagination?: { limit: number; offset: number; total: number; hasMore: boolean; nextOffset: number | null };
      limit?: number;
      offset?: number;
      total?: number;
      hasMore?: boolean;
      branchId?: number | null;
    }>(`/api/catalog/products${query}`),
  product: (id: number, opts?: { branchId?: number }) => {
    const params = new URLSearchParams();
    if (opts?.branchId != null && Number.isFinite(opts.branchId) && opts.branchId > 0) {
      params.set('branchId', String(opts.branchId));
    }
    const suffix = params.toString() ? `?${params}` : '';
    return request<any>(`/api/catalog/products/${id}${suffix}`);
  },
  promos: () => request<{ promos: any[] }>('/api/catalog/promos'),
  scanPrescription: (body: { text?: string; image?: string; branchId?: number }) =>
    request<{
      success: boolean;
      totalLinesDetected: number;
      matchedCount: number;
      items: Array<{
        id: string;
        rawLine: string;
        cleanedQuery: string;
        extractedDosage?: string;
        instructions?: string;
        confidence: number;
        confidenceLevel: 'high' | 'medium' | 'low';
        matchedProduct?: {
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
          availableQuantity?: number;
        };
        alternatives?: Array<{
          id: number;
          sku: string;
          nameUz: string;
          nameRu: string;
          price: number;
          manufacturer: string;
          isCheaper: boolean;
          priceDiff: number;
        }>;
      }>;
      disclaimer: {
        uz: string;
        ru: string;
        en: string;
      };
    }>('/api/catalog/prescription/scan', { method: 'POST', body: JSON.stringify(body) }, false),
  aiPrescriptionChat: (body: {
    message?: string;
    image?: string;
    language?: string;
    branchId?: number;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) =>
    request<{
      success: boolean;
      reply: string;
      isMedical: boolean;
      isPrescription?: boolean;
      matchedProducts: Array<{
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
      }>;
      quickSuggestions?: string[];
    }>('/api/catalog/prescription/chat', { method: 'POST', body: JSON.stringify(body) }, false),
  branches: (lat?: number, lng?: number, q = '', region = '') => {
    const params = new URLSearchParams();
    if (lat != null && Number.isFinite(lat)) params.set('lat', String(lat));
    if (lng != null && Number.isFinite(lng)) params.set('lng', String(lng));
    if (q) params.set('q', q);
    if (region) params.set('region', region);
    const suffix = params.toString() ? `?${params}` : '';
    return request<{ branches: any[]; total: number; regions?: string[]; network?: Record<string, unknown> }>(`/api/branches${suffix}`, {}, false);
  },
  cart: () => request<any>('/api/cart'),
  setCartBranch: (branchId: number) => request<any>('/api/cart/branch', { method: 'POST', body: JSON.stringify({ branchId }) }),
  addToCart: (productId: number, quantity = 1) => request<any>('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  updateCartItem: (id: number, quantity: number) => request<any>(`/api/cart/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
  removeCartItem: (id: number) => request<any>(`/api/cart/items/${id}`, { method: 'DELETE' }),
  orders: () => request<{ orders: any[] }>('/api/orders'),
  order: (id: number) => request<any>(`/api/orders/${id}`),
  orderPayment: (orderId: number) => request<any>(`/api/orders/${orderId}/payment`),
  checkout: (body: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
    const key = opts?.idempotencyKey || newIdempotencyKey('checkout');
    return request<any>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ ...body, idempotencyKey: key }),
      headers: { 'idempotency-key': key },
    });
  },
  cancelOrder: (id: number) => request<any>(`/api/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
  rateStaff: (body: { orderId: number; rating: number; tags?: string[]; comment?: string }) =>
    request<any>('/api/ratings', { method: 'POST', body: JSON.stringify(body) }),
  reverseGeocode: (lat: number, lng: number, lang = 'uz_UZ') => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), lang });
    return request<{
      formattedAddress: string | null;
      district: string | null;
      street: string | null;
      house: string | null;
      locality: string | null;
      kind: string | null;
      precision: string | null;
      coordinates: { lat: number; lng: number };
      provider: string;
      found?: boolean;
    }>(`/api/maps/geocode?${params}`, {}, false);
  },
  reminders: (opts?: { date?: string }) => {
    const q = opts?.date ? `?date=${encodeURIComponent(opts.date)}` : '';
    return request<{
      date: string;
      reminders: any[];
      schedule: Array<{
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
      }>;
      todayCompliance: {
        totalDoses: number;
        takenDoses: number;
        skippedDoses: number;
        pendingDoses: number;
        percent: number;
      };
      lowStockCount: number;
    }>(`/api/reminders${q}`);
  },
  createReminder: (body: {
    medicineName: string;
    productId?: number | null;
    dosage?: string;
    mealRelation?: string;
    intakeTimes: string[];
    startDate: string;
    endDate?: string | null;
    durationDays?: number | null;
    currentStock?: number;
    packageSize?: number;
    lowStockThreshold?: number;
    refillReminderEnabled?: boolean;
    memberTag?: string;
    customMemberName?: string | null;
    instructions?: string;
    familyMemberId?: number | null;
  }) => request<{ ok: boolean; reminder: any }>('/api/reminders', { method: 'POST', body: JSON.stringify(body) }),
  updateReminder: (id: number, body: Record<string, unknown>) =>
    request<{ ok: boolean; reminder: any }>(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteReminder: (id: number) =>
    request<{ ok: boolean; id: number }>(`/api/reminders/${id}`, { method: 'DELETE' }),
  takeMedication: (id: number, body: { scheduledDate: string; scheduledTime: string; status: 'taken' | 'skipped' | 'snoozed'; notes?: string }) =>
    request<{ ok: boolean; reminder: any; log: any }>(`/api/reminders/${id}/take`, { method: 'POST', body: JSON.stringify(body) }),
  refillAlerts: () =>
    request<{
      count: number;
      alerts: Array<{
        reminderId: number;
        medicineName: string;
        currentStock: number;
        lowStockThreshold: number;
        dosesPerDay: number;
        daysRemaining: number;
        productId: number | null;
        product: any;
        availableInStock: boolean;
      }>;
    }>('/api/reminders/refill-alerts'),
  refillReminderToCart: (id: number) =>
    request<{ ok: boolean; message: string; productName: string; cartCount: number }>(
      `/api/reminders/${id}/refill-to-cart`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
  familyMembers: () =>
    request<{
      members: Array<{
        id: number;
        fullName: string;
        relationship: string;
        birthDate: string | null;
        phone: string | null;
        chronicConditions: string;
        notes: string;
        notifyCaregiver: boolean;
        activeRemindersCount: number;
        lowStockCount: number;
        hasLowStockAlert: boolean;
      }>;
      count: number;
    }>('/api/family'),
  createFamilyMember: (body: {
    fullName: string;
    relationship?: string;
    birthDate?: string | null;
    phone?: string | null;
    chronicConditions?: string;
    notes?: string;
    notifyCaregiver?: boolean;
  }) =>
    request<{ ok: boolean; member: any }>('/api/family', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateFamilyMember: (id: number, body: Record<string, unknown>) =>
    request<{ ok: boolean; member: any }>(`/api/family/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteFamilyMember: (id: number) =>
    request<{ ok: boolean; id: number }>(`/api/family/${id}`, { method: 'DELETE' }),
  familyMemberSummary: (id: number) =>
    request<{
      member: any;
      reminders: any[];
      todayLogs: any[];
      lowStockAlerts: any[];
      needsCaregiverAttention: boolean;
    }>(`/api/family/${id}/summary`),
  getAddresses: () =>
    request<{ addresses: CustomerSavedAddress[]; count: number }>('/api/customer/addresses'),
  createAddress: (body: {
    label?: 'home' | 'work' | 'other';
    title?: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    district?: string | null;
    street?: string | null;
    house?: string | null;
    apartment?: string | null;
    entrance?: string | null;
    floor?: string | null;
    landmark?: string | null;
    courierNote?: string | null;
    isDefault?: boolean;
  }) =>
    request<{ address: CustomerSavedAddress }>('/api/customer/addresses', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAddress: (
    id: number,
    body: Partial<{
      label: 'home' | 'work' | 'other';
      title: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      district: string | null;
      street: string | null;
      house: string | null;
      apartment: string | null;
      entrance: string | null;
      floor: string | null;
      landmark: string | null;
      courierNote: string | null;
      isDefault: boolean;
    }>,
  ) =>
    request<{ address: CustomerSavedAddress }>(`/api/customer/addresses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAddress: (id: number) =>
    request<{ success: boolean }>(`/api/customer/addresses/${id}`, { method: 'DELETE' }),
  registerPushToken: (body: {
    token: string;
    platform?: 'web' | 'android' | 'ios';
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  }) =>
    request<{ success: boolean; deviceId: number }>('/api/customer/devices/push-token', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  unregisterPushToken: (token: string) =>
    request<{ success: boolean }>('/api/customer/devices/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),
  getDevices: () =>
    request<{
      devices: Array<{
        id: number;
        platform: string;
        userAgent: string | null;
        isActive: boolean;
        lastUsedAt: string | null;
        createdAt: string;
      }>;
    }>('/api/customer/devices'),
  sendTestPushNotification: () =>
    request<{ success: boolean; sent: number; title: string; body: string }>('/api/customer/devices/test', {
      method: 'POST',
    }),
};

export type CustomerSavedAddress = {
  id: number;
  customerId: number;
  label: 'home' | 'work' | 'other';
  title: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  district?: string | null;
  street?: string | null;
  house?: string | null;
  apartment?: string | null;
  entrance?: string | null;
  floor?: string | null;
  landmark?: string | null;
  courierNote?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export { API_URL, newIdempotencyKey };
