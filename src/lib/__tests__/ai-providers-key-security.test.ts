import { decryptKey, encryptKey } from '@/lib/ai-providers';

describe('BYOK key storage security', () => {
  const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  });

  afterAll(() => {
    if (indexedDbDescriptor) {
      Object.defineProperty(globalThis, 'indexedDB', indexedDbDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  test('fails closed when a browser-bound secure key store is unavailable', async () => {
    await expect(encryptKey('sk-sensitive-test-key')).rejects.toThrow(
      '보안 키 저장소',
    );
  });

  test('keeps legacy ciphertext readable for one-time migration', async () => {
    await expect(decryptKey(`v1:${btoa('legacy-key')}`)).resolves.toBe('legacy-key');
  });
});
