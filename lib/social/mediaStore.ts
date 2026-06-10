'use client';

// Local-first media store. Files live in the browser's Origin Private File
// System (OPFS) — they never leave the machine. IndexedDB is the fallback for
// browsers without OPFS. Only metadata syncs to Postgres via /api/social/assets.

const OPFS_DIR = 'social-studio';
const IDB_NAME = 'social-studio';
const IDB_STORE = 'files';

function hasOPFS(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.storage
    && typeof navigator.storage.getDirectory === 'function';
}

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

// ── IndexedDB fallback ────────────────────────────────────────
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(id: string, blob: Blob): Promise<void> {
  return idb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGet(id: string): Promise<Blob | null> {
  return idb().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  }));
}

function idbDelete(id: string): Promise<void> {
  return idb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// ── public API ────────────────────────────────────────────────
export async function persistHint(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* best-effort */ }
}

export async function saveMedia(id: string, file: Blob): Promise<void> {
  if (hasOPFS()) {
    const dir = await opfsDir();
    const handle = await dir.getFileHandle(id, { create: true });
    const w = await handle.createWritable();
    await w.write(file);
    await w.close();
    return;
  }
  await idbPut(id, file);
}

export async function getMedia(id: string): Promise<Blob | null> {
  if (hasOPFS()) {
    try {
      const dir = await opfsDir();
      const handle = await dir.getFileHandle(id);
      return await handle.getFile();
    } catch {
      // fall through — the file may have been stored via IDB on this browser before
    }
  }
  try { return await idbGet(id); } catch { return null; }
}

export async function deleteMedia(id: string): Promise<void> {
  if (hasOPFS()) {
    try {
      const dir = await opfsDir();
      await dir.removeEntry(id);
    } catch { /* not there */ }
  }
  try { await idbDelete(id); } catch { /* not there */ }
}

export async function hasMedia(id: string): Promise<boolean> {
  return (await getMedia(id)) !== null;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch { return null; }
}
