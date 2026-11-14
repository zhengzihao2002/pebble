/**
 * Browser online/offline events are hints about network interfaces. Verify
 * the app with an uncached request even when that hint is false: Chrome can
 * keep a stale offline flag until its network process restarts.
 *
 * The service worker bypasses /ping.txt. Read its body, not just its status,
 * so a captive portal or redirect cannot masquerade as a successful check.
 */
let reachable: boolean | null = null;
let pending: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
export const readOffline = () => reachable === false;
export const onlineServerSnapshot = () => false;

export function isServerReachable(timeoutMs = 4000): Promise<boolean> {
  if (pending) return pending;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  pending = (async () => {
    let next = false;
    try {
      const res = await fetch(`/ping.txt?t=${Date.now()}`, { cache: 'no-store', redirect: 'manual', signal: controller.signal });
      next = res.ok && (await res.text()).trim() === 'ok';
    } catch { /* Retried on return/focus and while disconnected. */ }
    finally { clearTimeout(timer); }
    if (reachable !== next) {
      reachable = next;
      listeners.forEach(listener => listener());
    }
    return next;
  })().finally(() => { pending = null; });
  return pending;
}

/** One monitor shared by subscribers; no queued writes or reloads on recovery. */
let stopMonitor: (() => void) | null = null;
export function subscribeConnectivity(listener: () => void) {
  listeners.add(listener);
  if (!stopMonitor && typeof window !== 'undefined') {
    const check = () => { if (!document.hidden) void isServerReachable(); };
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    // Retry even if Chrome never emits another online event. Healthy tabs do
    // not poll the server; only failed checks or a stale interface hint do.
    const timer = setInterval(() => {
      if (readOffline() || navigator.onLine === false) check();
    }, 15_000);
    stopMonitor = () => {
      clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
    check();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopMonitor?.();
      stopMonitor = null;
    }
  };
}
