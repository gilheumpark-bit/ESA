import { decryptKey, encryptKey } from '@/lib/ai-providers';

export const BYOK_STORAGE_PREFIX = 'esa-byok-';

function storageKey(providerId: string): string {
  if (!/^[a-z0-9-]+$/.test(providerId)) {
    throw new Error('지원하지 않는 AI 공급자 식별자입니다.');
  }
  return `${BYOK_STORAGE_PREFIX}${providerId}`;
}

/** Load a provider key and migrate legacy ciphertext to browser-bound v5. */
export async function loadStoredProviderKey(providerId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const key = storageKey(providerId);
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;

  const raw = await decryptKey(stored);
  if (!stored.startsWith('v5:')) {
    const migrated = await encryptKey(raw);
    window.localStorage.setItem(key, migrated);
  }
  return raw;
}

export async function saveStoredProviderKey(providerId: string, raw: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const encrypted = await encryptKey(raw);
  window.localStorage.setItem(storageKey(providerId), encrypted);
}

export function deleteStoredProviderKey(providerId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(providerId));
}
