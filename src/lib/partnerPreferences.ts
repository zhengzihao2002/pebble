const PREFIX = 'pebble-partner-preferences:v1:';

/** undefined is the main workspace. null is a partner workspace whose viewer
 * identity is unavailable, so it must never fall back to a main workspace key. */
export function workspacePreferenceKey(key: string, partnerScope: string | null | undefined): string | null {
  if (partnerScope === undefined) return key;
  return partnerScope ? `${PREFIX}${partnerScope}:${key}` : null;
}

export function readWorkspacePreference(key: string | null): string | null {
  try { return key ? window.localStorage.getItem(key) : null; }
  catch { return null; }
}

export function writeWorkspacePreference(key: string | null, value: string) {
  try { if (key) window.localStorage.setItem(key, value); }
  catch { /* Storage may be unavailable. The selection still applies. */ }
}

export function readPartnerChoice(key: string, scope: string | null): unknown {
  const saved = readWorkspacePreference(workspacePreferenceKey(key, scope));
  try { return saved ? JSON.parse(saved) : null; }
  catch { return null; }
}

export function writePartnerChoice(key: string, scope: string | null, value: unknown) {
  writeWorkspacePreference(workspacePreferenceKey(key, scope), JSON.stringify(value));
}
