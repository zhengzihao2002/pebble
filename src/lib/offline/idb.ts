/**
 * A very small IndexedDB wrapper - just what the offline queue and the
 * reference-data snapshot need, with no dependency.
 *
 * Two stores in one database:
 *   queue      one record per waiting transaction, key `${userId}:${clientId}`,
 *              indexed by userId so one user's items are read without
 *              touching anyone else's.
 *   snapshots  one record per user (their accounts and categories), key userId.
 *
 * Every call resolves to a value or REJECTS; callers decide what a failure
 * means (the queue refuses to promise "saved on this device" when it cannot
 * actually save). IndexedDB can be absent or blocked (some privacy modes,
 * storage cleared under pressure), which is why nothing here assumes it works.
 */

const DB_NAME = 'pebble-offline';
const DB_VERSION = 1;
export const QUEUE_STORE = 'queue';
export const SNAPSHOT_STORE = 'snapshots';

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'key' });
        store.createIndex('userId', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema, or the browser reclaiming the
      // connection: forget this handle so the next call reopens.
      db.onversionchange = () => { db.close(); opening = null; };
      db.onclose = () => { opening = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    // A failed open must not be remembered, or one blip would disable
    // offline saving until the page is reloaded.
    opening = null;
    throw err;
  });
  return opening;
}

function run<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | null): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result: unknown;
    const request = work(tx.objectStore(storeName));
    if (request) request.onsuccess = () => { result = request.result; };
    // Resolve on COMPLETE (durably committed), not on the request's success:
    // "saved on this device" must be true when it is said.
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  }));
}

export function idbPut(storeName: string, value: unknown): Promise<void> {
  return run<void>(storeName, 'readwrite', (s) => s.put(value));
}

export function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return run<void>(storeName, 'readwrite', (s) => s.delete(key));
}

export function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(storeName, 'readonly', (s) => s.get(key));
}

export function idbAllKeys(storeName: string): Promise<IDBValidKey[]> {
  return run<IDBValidKey[]>(storeName, 'readonly', (s) => s.getAllKeys());
}

export function idbGetAllByIndex<T>(storeName: string, index: string, key: IDBValidKey): Promise<T[]> {
  return run<T[]>(storeName, 'readonly', (s) => s.index(index).getAll(key));
}

/** Deletes every record of a store whose index value matches. */
export function idbDeleteByIndex(storeName: string, index: string, key: IDBValidKey): Promise<void> {
  return openDb().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const cursorRequest = tx.objectStore(storeName).index(index).openKeyCursor(IDBKeyRange.only(key));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      tx.objectStore(storeName).delete(cursor.primaryKey);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  }));
}

export function idbClear(storeName: string): Promise<void> {
  return run<void>(storeName, 'readwrite', (s) => s.clear());
}
