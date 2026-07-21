import {
  hashDrawingBlob,
  loadDrawingAsset,
  storeDrawingAsset,
} from '@/lib/drawing-asset-store';

describe('drawing asset store', () => {
  const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

  afterEach(() => {
    if (originalIndexedDB) {
      Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('hashes the exact uploaded bytes using SHA-256', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'image/png' });

    await expect(hashDrawingBlob(blob)).resolves.toBe(
      '054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8',
    );
  });

  it('rejects a drawing whose bytes do not match the report drawingHash', async () => {
    const blob = new Blob(['company drawing'], { type: 'image/png' });

    await expect(storeDrawingAsset(blob, '0'.repeat(64), 'drawing.png')).rejects.toThrow(
      'DRAWING_ASSET_HASH_MISMATCH',
    );
  });

  it('fails closed without leaking the drawing when IndexedDB is unavailable', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
    const blob = new Blob(['drawing'], { type: 'image/png' });
    const drawingHash = await hashDrawingBlob(blob);

    await expect(storeDrawingAsset(blob, drawingHash, 'drawing.png')).resolves.toBe('unavailable');
    await expect(loadDrawingAsset(drawingHash)).resolves.toBeNull();
  });
});
