import type { Account, CategoryItem } from '@/lib/data/mappers';
import type { AddExpenseActionInput, AddIncomeActionInput } from '@/lib/actions/pebble';
import { QUEUE_STORE, SNAPSHOT_STORE, idbAllKeys, idbClear, idbDelete, idbDeleteByIndex, idbGet, idbGetAllByIndex, idbPut } from './idb';

/**
 * The device-side queue of transactions saved while offline, and the snapshot
 * of reference data the Add transaction dialog needs to work without a
 * connection. Persistence only - the React state lives in OfflineProvider.
 *
 * KEYED BY USER ID, deliberately. The queue is private financial data on a
 * device that may be shared, and an upload is made with whoever is signed in
 * at that moment, so:
 *  - everything is read and written per user; one user's items are never
 *    listed, shown or uploaded under another's session;
 *  - the server independently treats the client id as owned by the session
 *    user (actions/pebble.ts), so even a tampered queue cannot attach a row
 *    to someone else;
 *  - signing out KEEPS the queue (losing typed-in money entries silently is
 *    worse than keeping them) after a warning that offers to discard it.
 */

/** What the form submits, minus the client id (added when it is uploaded). */
export type QueuedPayload =
  | Omit<AddExpenseActionInput, 'clientId'>
  | Omit<AddIncomeActionInput, 'clientId'>;

export interface QueuedTransaction {
  /** `${userId}:${clientId}` - the record key. */
  key: string;
  userId: string;
  /** Also the row id on the server; see lib/offline/clientId.ts. */
  clientId: string;
  kind: 'expense' | 'income';
  createdAt: number;
  payload: QueuedPayload;
  /**
   * What the waiting list shows, captured when it was saved so the list never
   * depends on reference data that may have changed since: the account's own
   * name (user data, never translated), the amount that will be recorded and
   * the category's own icon and colour (expenses only).
   */
  display: { accountLabel: string; amount: number; iconKey?: string; color?: string };
}

export interface ReferenceSnapshot {
  userId: string;
  savedAt: number;
  accounts: Account[];
  categories: CategoryItem[];
}

export const queueKey = (userId: string, clientId: string) => `${userId}:${clientId}`;

/** This user's waiting transactions, oldest first. */
export async function listQueue(userId: string): Promise<QueuedTransaction[]> {
  const rows = await idbGetAllByIndex<QueuedTransaction>(QUEUE_STORE, 'userId', userId);
  return rows.sort((a, b) => a.createdAt - b.createdAt || a.clientId.localeCompare(b.clientId));
}

export async function enqueue(item: QueuedTransaction): Promise<void> {
  await idbPut(QUEUE_STORE, item);
  announceQueueChange();
}

export async function dequeue(userId: string, clientId: string): Promise<void> {
  await idbDelete(QUEUE_STORE, queueKey(userId, clientId));
  announceQueueChange();
}

export async function clearQueue(userId: string): Promise<void> {
  await idbDeleteByIndex(QUEUE_STORE, 'userId', userId);
  announceQueueChange();
}

export async function saveSnapshot(snapshot: ReferenceSnapshot): Promise<void> {
  await idbPut(SNAPSHOT_STORE, snapshot);
}

export async function loadSnapshot(userId: string): Promise<ReferenceSnapshot | null> {
  const found = await idbGet<ReferenceSnapshot>(SNAPSHOT_STORE, userId);
  return found && found.userId === userId ? found : null;
}

export async function clearSnapshot(userId: string): Promise<void> {
  await idbDelete(SNAPSHOT_STORE, userId);
}

/** Deletes every snapshot except this user's (someone else is signed in now). */
export async function clearOtherSnapshots(userId: string): Promise<void> {
  const keys = await idbAllKeys(SNAPSHOT_STORE);
  await Promise.all(keys.filter((k) => k !== userId).map((k) => idbDelete(SNAPSHOT_STORE, k)));
}

/** Every user's snapshot - the sign-out path, which does not know whose. */
export async function clearAllSnapshots(): Promise<void> {
  await idbClear(SNAPSHOT_STORE);
}

/* ---- Tabs agree --------------------------------------------------------- */
// Two open windows (or the installed app and a Safari tab) share one
// IndexedDB. A change in either is announced so the other reloads the list;
// IndexedDB itself has no change events. BroadcastChannel where it exists, a
// localStorage write (which fires `storage` in the OTHER tabs) where it does
// not.

const CHANNEL = 'pebble-offline-queue';
const PING_KEY = 'pebble-offline-ping';
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try { channel = new BroadcastChannel(CHANNEL); } catch { channel = null; }
  return channel;
}

function announceQueueChange(): void {
  const c = getChannel();
  if (c) { c.postMessage('changed'); return; }
  try { window.localStorage.setItem(PING_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}

/** Calls `onChange` when ANOTHER tab changes the queue. Returns the unsubscribe. */
export function subscribeQueueChanges(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const c = getChannel();
  if (c) {
    const handler = () => onChange();
    c.addEventListener('message', handler);
    return () => c.removeEventListener('message', handler);
  }
  const handler = (e: StorageEvent) => { if (e.key === PING_KEY) onChange(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
