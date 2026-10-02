/**
 * Customer session teardown. Pure (dependencies injected) so it runs under Node tests.
 * Device preferences such as the UI language are intentionally preserved.
 */

export const LANGUAGE_STORAGE_KEY = 'soglom-language';
export const SESSION_ENDED_KEY = 'vaksinamed-session-ended';
/** Customer-specific local caches; removed on logout. Never add device preferences here. */
export const CUSTOMER_CACHE_KEYS = ['vaksinamed-cart-price-snap'] as const;

export type LogoutDeps = {
  /** Server-side revocation (POST /api/auth/logout). May throw or hang when offline. */
  revoke: () => Promise<unknown>;
  clearToken: () => Promise<void>;
  markSessionEnded: () => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  /** Synchronous in-memory cleanup (drafts, React state). */
  clearMemory: () => void;
  revokeTimeoutMs?: number;
};

export type LogoutResult = { revoked: boolean };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Local state is always cleared, even when the server cannot be reached. */
export async function performLogout(deps: LogoutDeps): Promise<LogoutResult> {
  let revoked = false;
  try {
    await withTimeout(Promise.resolve().then(deps.revoke), deps.revokeTimeoutMs ?? 5000);
    revoked = true;
  } catch {
    revoked = false;
  }
  try {
    await deps.clearToken();
  } catch {
    // storage failure must not keep the user signed in for this run
  }
  try {
    await deps.markSessionEnded();
  } catch {
    // best effort
  }
  for (const key of CUSTOMER_CACHE_KEYS) {
    try {
      await deps.removeItem(key);
    } catch {
      // best effort
    }
  }
  deps.clearMemory();
  return { revoked };
}
