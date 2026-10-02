import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideProfileLanguage, DEFAULT_LANGUAGE, parseStoredLanguage } from '../lib/languagePreference';
import {
  CUSTOMER_CACHE_KEYS,
  LANGUAGE_STORAGE_KEY,
  performLogout,
  SESSION_ENDED_KEY,
  type LogoutDeps,
} from '../lib/session';

const TOKEN_KEY = 'vaksinamed-customer-token';
const SECRET_TOKEN = 'cust_tok_DO_NOT_LEAK_0123456789';

function makeDevice(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  let memoryCleared = false;
  const calls: string[] = [];
  const deps = (revoke: LogoutDeps['revoke'], overrides: Partial<LogoutDeps> = {}): LogoutDeps => ({
    revoke: async () => {
      calls.push('revoke');
      return revoke();
    },
    clearToken: async () => {
      calls.push('clearToken');
      store.delete(TOKEN_KEY);
    },
    markSessionEnded: async () => {
      calls.push('markSessionEnded');
      store.set(SESSION_ENDED_KEY, '1');
    },
    removeItem: async (key) => {
      calls.push(`remove:${key}`);
      store.delete(key);
    },
    clearMemory: () => {
      memoryCleared = true;
    },
    ...overrides,
  });
  return { store, calls, deps, isMemoryCleared: () => memoryCleared };
}

function signedInDevice(language = 'ru') {
  return makeDevice({
    [TOKEN_KEY]: SECRET_TOKEN,
    [LANGUAGE_STORAGE_KEY]: language,
    'vaksinamed-cart-price-snap': '{"1":12000}',
  });
}

function captureConsole() {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ['log', 'warn', 'error'] as const) {
    console[k] = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
  }
  return { lines, restore: () => Object.assign(console, orig) };
}

describe('logout', () => {
  it('revokes server-side, then clears token, customer caches and memory; keeps language', async () => {
    const device = signedInDevice('ru');
    const result = await performLogout(device.deps(async () => ({ ok: true, revoked: true })));
    assert.deepEqual(result, { revoked: true });
    assert.equal(device.calls[0], 'revoke', 'revocation must run while the token still exists');
    assert.equal(device.store.has(TOKEN_KEY), false);
    for (const key of CUSTOMER_CACHE_KEYS) assert.equal(device.store.has(key), false, key);
    assert.equal(device.store.get(SESSION_ENDED_KEY), '1');
    assert.equal(device.store.get(LANGUAGE_STORAGE_KEY), 'ru', 'language preference must survive logout');
    assert.equal(device.isMemoryCleared(), true);
  });

  it('never removes device preferences', () => {
    assert.ok(!CUSTOMER_CACHE_KEYS.includes(LANGUAGE_STORAGE_KEY as never));
  });

  it('offline: server unreachable still logs out locally (no fake server success)', async () => {
    const device = signedInDevice('en');
    const result = await performLogout(device.deps(async () => {
      throw Object.assign(new Error('Failed to fetch'), { code: 'NETWORK_ERROR' });
    }));
    assert.deepEqual(result, { revoked: false });
    assert.equal(device.store.has(TOKEN_KEY), false);
    assert.equal(device.store.get(SESSION_ENDED_KEY), '1');
    assert.equal(device.store.get(LANGUAGE_STORAGE_KEY), 'en');
    assert.equal(device.isMemoryCleared(), true);
  });

  it('hanging revoke request times out and local cleanup still happens', async () => {
    const device = signedInDevice('uz');
    const started = Date.now();
    const result = await performLogout({
      ...device.deps(() => new Promise(() => undefined)),
      revokeTimeoutMs: 50,
    });
    assert.ok(Date.now() - started < 2000);
    assert.deepEqual(result, { revoked: false });
    assert.equal(device.store.has(TOKEN_KEY), false);
  });

  it('storage failures do not abort cleanup', async () => {
    const device = signedInDevice('ru');
    const result = await performLogout(device.deps(async () => ({ ok: true }), {
      clearToken: async () => {
        throw new Error('disk full');
      },
      markSessionEnded: async () => {
        throw new Error('disk full');
      },
    }));
    assert.deepEqual(result, { revoked: true });
    assert.equal(device.isMemoryCleared(), true);
    for (const key of CUSTOMER_CACHE_KEYS) assert.equal(device.store.has(key), false);
  });

  it('does not log or return the token', async () => {
    const device = signedInDevice('ru');
    const cap = captureConsole();
    let result: unknown;
    try {
      result = await performLogout(device.deps(async () => {
        throw new Error('HTTP 500');
      }));
    } finally {
      cap.restore();
    }
    assert.ok(!JSON.stringify(result).includes(SECRET_TOKEN));
    assert.ok(cap.lines.every((line) => !line.includes(SECRET_TOKEN)));
  });
});

describe('language persistence', () => {
  it('defaults to Uzbek when nothing (or garbage) is stored', () => {
    assert.equal(DEFAULT_LANGUAGE, 'uz');
    assert.equal(parseStoredLanguage(null), null);
    assert.equal(parseStoredLanguage('de'), null);
    assert.equal(parseStoredLanguage(''), null);
  });

  it('restores a stored language', () => {
    assert.equal(parseStoredLanguage('ru'), 'ru');
    assert.equal(parseStoredLanguage('en'), 'en');
  });

  it('device choice wins over the profile on login and is pushed to the server', () => {
    assert.deepEqual(decideProfileLanguage({ local: 'ru', hasLocalPreference: true, server: 'uz' }), { adopt: null, push: 'ru' });
    assert.deepEqual(decideProfileLanguage({ local: 'en', hasLocalPreference: true, server: 'en' }), { adopt: null, push: null });
  });

  it('profile language is adopted only when the device has no preference', () => {
    assert.deepEqual(decideProfileLanguage({ local: 'uz', hasLocalPreference: false, server: 'ru' }), { adopt: 'ru', push: null });
    assert.deepEqual(decideProfileLanguage({ local: 'uz', hasLocalPreference: false, server: 'xx' }), { adopt: null, push: null });
  });

  it('RU selected -> login -> logout -> still RU', async () => {
    const device = makeDevice({ [LANGUAGE_STORAGE_KEY]: 'ru' });
    const local = parseStoredLanguage(device.store.get(LANGUAGE_STORAGE_KEY))!;
    const onLogin = decideProfileLanguage({ local, hasLocalPreference: true, server: 'uz' });
    assert.equal(onLogin.adopt, null);
    device.store.set(TOKEN_KEY, SECRET_TOKEN);
    await performLogout(device.deps(async () => ({ ok: true })));
    assert.equal(parseStoredLanguage(device.store.get(LANGUAGE_STORAGE_KEY)), 'ru');
  });
});
