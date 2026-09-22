import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'vaksinamed-customer-token';

let memoryToken: string | null = null;

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
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

function telegramId() {
  if (typeof window !== 'undefined') {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    if (user?.id) return String(user.id);
  }
  return process.env.EXPO_PUBLIC_TELEGRAM_ID || '';
}

export type ApiError = Error & { status?: number; code?: string };

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const tg = telegramId();
  if (tg) headers.set('x-telegram-id', tg);
  if (auth) {
    const token = await getAuthToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error('Serverga ulanib bo‘lmadi. API ishlayotganini tekshiring (localhost:5000).');
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
  logout: async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    await setAuthToken(null);
  },
  profile: () => request<any>('/api/loyalty/profile'),
  updateProfile: (body: { firstName?: string; lastName?: string; language?: string }) =>
    request<any>('/api/loyalty/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  posCard: () => request<any>('/api/pos/card'),
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
};

export { API_URL, newIdempotencyKey };
