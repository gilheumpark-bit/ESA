import { loadStoredProviderKey } from '@/lib/byok-storage';

export type VisionProvider = 'openai' | 'claude' | 'gemini';

const VISION_PROVIDERS: readonly VisionProvider[] = ['openai', 'claude', 'gemini'];

/** 브라우저에 암호화 저장된 Vision 키를 복호화해 현재 요청에만 반환한다. */
export async function getFirstAvailableVisionKey(): Promise<{
  provider: VisionProvider;
  key: string;
} | null> {
  if (typeof window === 'undefined') return null;
  for (const provider of VISION_PROVIDERS) {
    try {
      const key = await loadStoredProviderKey(provider);
      if (key) return { provider, key };
    } catch {
      // 손상되거나 없는 키 하나가 다른 제공자 확인을 막아서는 안 된다.
    }
  }
  return null;
}
