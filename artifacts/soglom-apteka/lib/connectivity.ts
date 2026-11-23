/**
 * App-wide connectivity signal — browser online/offline + API fetch outcomes.
 * OfflineBanner / useNetworkStatus subscribe here; api.ts reports successes/failures.
 */

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();
let lastKnownOnline = true;

export function getConnectivity(): boolean {
  return lastKnownOnline;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(lastKnownOnline);
  return () => {
    listeners.delete(listener);
  };
}

export function reportConnectivity(online: boolean): void {
  if (lastKnownOnline === online) return;
  lastKnownOnline = online;
  listeners.forEach((fn) => {
    try {
      fn(online);
    } catch {
      // ignore subscriber errors
    }
  });
}

/** Lightweight reachability probe (native + recovery checks). */
export async function probeConnectivity(apiBase: string, timeoutMs = 4000): Promise<boolean> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase.replace(/\/+$/, '')}/api/health/live`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });
    const ok = res.ok;
    reportConnectivity(ok);
    return ok;
  } catch {
    reportConnectivity(false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
