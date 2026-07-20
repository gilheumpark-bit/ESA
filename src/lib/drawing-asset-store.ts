/**
 * Browser-local source drawing store.
 *
 * Company drawings never leave the existing analysis request path. The report
 * keeps only the SHA-256 key and this store keeps the source bytes locally so
 * the evidence overlay can be reopened on the same browser.
 */

const DATABASE_NAME = 'esa-drawing-assets';
const STORE_NAME = 'assets';
const DATABASE_VERSION = 1;
const ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const DRAWING_HASH_PATTERN = /^[a-f0-9]{64}$/;

export type DrawingAssetStoreResult = 'stored' | 'unavailable';

export interface DrawingAssetRecord {
  version: 1;
  drawingHash: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  storedAt: number;
  expiresAt: number;
}

function normalizeDrawingHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!DRAWING_HASH_PATTERN.test(normalized)) {
    throw new Error('INVALID_DRAWING_HASH');
  }
  return normalized;
}

function safeFileName(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 240);
  return normalized || 'drawing';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashDrawingBlob(blob: Blob): Promise<string> {
  if (typeof globalThis.crypto?.subtle === 'undefined') {
    throw new Error('DRAWING_ASSET_CRYPTO_UNAVAILABLE');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof globalThis.indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'drawingHash' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('DRAWING_ASSET_STORE_UNAVAILABLE'));
    request.onblocked = () => reject(new Error('DRAWING_ASSET_STORE_UNAVAILABLE'));
  });
}

function writeRecord(database: IDBDatabase, record: DrawingAssetRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('DRAWING_ASSET_STORE_UNAVAILABLE'));
    transaction.onabort = () => reject(new Error('DRAWING_ASSET_STORE_UNAVAILABLE'));
  });
}

function readRecord(database: IDBDatabase, drawingHash: string): Promise<DrawingAssetRecord | null> {
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(drawingHash);
    request.onsuccess = () => resolve((request.result as DrawingAssetRecord | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

function removeRecord(database: IDBDatabase, drawingHash: string): Promise<void> {
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(drawingHash);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function storeDrawingAsset(
  blob: Blob,
  expectedDrawingHash: string,
  fileName = 'drawing',
): Promise<DrawingAssetStoreResult> {
  const drawingHash = normalizeDrawingHash(expectedDrawingHash);
  if (blob.size === 0 || blob.size > MAX_ASSET_BYTES) {
    throw new Error('INVALID_DRAWING_ASSET_SIZE');
  }
  if (await hashDrawingBlob(blob) !== drawingHash) {
    throw new Error('DRAWING_ASSET_HASH_MISMATCH');
  }

  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    if (!database) return 'unavailable';
    const storedAt = Date.now();
    await writeRecord(database, {
      version: 1,
      drawingHash,
      blob,
      mimeType: blob.type || 'application/octet-stream',
      fileName: safeFileName(fileName),
      storedAt,
      expiresAt: storedAt + ASSET_TTL_MS,
    });
    return 'stored';
  } catch {
    return 'unavailable';
  } finally {
    database?.close();
  }
}

export async function loadDrawingAsset(drawingHashInput: string): Promise<DrawingAssetRecord | null> {
  let database: IDBDatabase | null = null;
  try {
    const drawingHash = normalizeDrawingHash(drawingHashInput);
    database = await openDatabase();
    if (!database) return null;
    const record = await readRecord(database, drawingHash);
    if (
      !record
      || record.version !== 1
      || record.drawingHash !== drawingHash
      || !(record.blob instanceof Blob)
      || record.expiresAt <= Date.now()
      || await hashDrawingBlob(record.blob) !== drawingHash
    ) {
      if (record) await removeRecord(database, drawingHash);
      return null;
    }
    return record;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function deleteDrawingAsset(drawingHashInput: string): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    const drawingHash = normalizeDrawingHash(drawingHashInput);
    database = await openDatabase();
    if (database) await removeRecord(database, drawingHash);
  } catch {
    // Local source drawing cleanup is best effort.
  } finally {
    database?.close();
  }
}
