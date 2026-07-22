import { loadSelectedModel, loadStoredProviderKey } from '@/lib/byok-storage';
import { getModelList } from '@/lib/ai-providers';

export type VisionProvider = 'openai' | 'claude' | 'gemini';

const VISION_PROVIDERS: readonly VisionProvider[] = ['openai', 'claude', 'gemini'];

/**
 * 사용자가 BYOK에서 명시 선택한 모델 id를 돌려준다. 미선택이거나, 저장된 id가
 * 현재 카탈로그에 없으면(구 모델 제거) 빈 문자열을 돌려준다 — 이때 서버는 각
 * 경로의 vision 전용 폴백 모델을 쓴다. chat 기본(getDefaultModel)을 여기서
 * 강제하면 vision이 저티어로 조용히 강등되는 실측 회귀가 생겨 금지한다.
 */
export function resolveSelectedModel(provider: string): string {
  const saved = loadSelectedModel(provider);
  return saved && getModelList(provider).some((m) => m.id === saved) ? saved : '';
}

/**
 * 브라우저에 암호화 저장된 Vision 키를 복호화해 현재 요청에만 반환한다.
 * model은 사용자가 명시 선택한 모델이거나, 미선택/구모델이면 빈 문자열(서버가
 * vision 전용 폴백 모델을 쓴다).
 */
export async function getFirstAvailableVisionKey(): Promise<{
  provider: VisionProvider;
  key: string;
  model: string;
} | null> {
  if (typeof window === 'undefined') return null;
  for (const provider of VISION_PROVIDERS) {
    try {
      const key = await loadStoredProviderKey(provider);
      if (key) {
        return { provider, key, model: resolveSelectedModel(provider) };
      }
    } catch {
      // 손상되거나 없는 키 하나가 다른 제공자 확인을 막아서는 안 된다.
    }
  }
  return null;
}
