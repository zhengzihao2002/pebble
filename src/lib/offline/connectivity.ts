/**
 * navigator.onLine only says a network INTERFACE is up: it is true on Wi-Fi
 * with no internet behind it, and it can lag after a change. So before
 * offering to upload, a cheap real request confirms the server is reachable.
 *
 * /ping.txt is a 2-byte static file containing "ok". public/sw.js never
 * intercepts it, and cache: 'no-store' keeps the browser's own cache out of
 * it, so the answer is the network's. The body is READ and compared: a
 * captive-portal Wi-Fi answers every request with a 200 page of its own, which
 * a status check alone (or a HEAD) would take for "online". Redirects count as
 * failure for the same reason.
 */
export async function isServerReachable(timeoutMs = 4000): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/ping.txt?t=${Date.now()}`, { cache: 'no-store', redirect: 'manual', signal: controller.signal });
    return res.ok && (await res.text()).trim() === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
