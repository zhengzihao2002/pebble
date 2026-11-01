// A display-only planning input, explicitly remembered on this browser.
// Never copied into transactions, the database or the layout geometry cache.
const PREFIX = 'pebble-budget-income:v1:';
const memory = new Map<string, string>();

function valid(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64
    && (value === '' || (value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0));
}

export function readManualIncomeDraft(userId: string | null): string {
  if (!userId || typeof window === 'undefined') return '';
  if (memory.has(userId)) return memory.get(userId)!;
  try {
    const raw = window.localStorage.getItem(PREFIX + userId);
    if (!raw || raw.length > 200) return '';
    const saved = JSON.parse(raw);
    return saved?.version === 1 && valid(saved.amount) ? saved.amount : '';
  } catch { return ''; }
}

export function writeManualIncomeDraft(userId: string | null, amount: string): void {
  if (!userId || typeof window === 'undefined' || !valid(amount)) return;
  try {
    window.localStorage.setItem(PREFIX + userId, JSON.stringify({ version: 1, amount }));
    memory.delete(userId);
  } catch { memory.set(userId, amount); /* Keep editing when storage is blocked. */ }
}

export function clearManualIncomeDraft(userId: string): void {
  memory.delete(userId);
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(PREFIX + userId); } catch { /* unavailable */ }
}
