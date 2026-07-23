import { loadSelectedModel, loadStoredProviderKey } from '@/lib/byok-storage';
import { getDefaultModel } from '@/lib/ai-providers';

export type VisionProvider = 'openai' | 'claude' | 'gemini';

export interface VisionByokSelection {
  provider: VisionProvider;
  key: string;
  model: string;
}

const VISION_PROVIDERS: readonly VisionProvider[] = ['openai', 'claude', 'gemini'];
const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;

/** 실제 OCR·도면 분석 요청에 BYOK 키와 선택 모델이 전달되는 공급자인지 판별한다. */
export function isVisionProvider(provider: string): provider is VisionProvider {
  return (VISION_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * 사용자가 BYOK에서 명시 선택한 모델 id를 돌려준다. 공급자 /models 응답으로
 * 선택한 모델은 정적 카탈로그보다 빨리 갱신될 수 있으므로 안전한 id 형식이면
 * 통과시킨다. 미선택·변조 값은 빈 문자열로 두어 서버 Vision 폴백을 보존한다.
 */
export function resolveSelectedModel(provider: string): string {
  const saved = loadSelectedModel(provider);
  return saved && SAFE_MODEL_ID.test(saved) && !saved.includes('..') && !saved.includes('//') ? saved : '';
}

/**
 * 브라우저에 암호화 저장된 Vision 키를 복호화해 현재 요청에만 반환한다.
 * model은 사용자가 명시 선택한 모델이거나, 미선택/구모델이면 빈 문자열(서버가
 * vision 전용 폴백 모델을 쓴다).
 */
export async function getFirstAvailableVisionKey(
  allowedProviders: readonly VisionProvider[] = VISION_PROVIDERS,
): Promise<VisionByokSelection | null> {
  if (typeof window === 'undefined') return null;
  for (const provider of VISION_PROVIDERS.filter((candidate) => allowedProviders.includes(candidate))) {
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

/** Convert a browser Vision BYOK selection into the /api/chat request contract. */
export function buildVisionChatRequest(selection: VisionByokSelection | null): {
  provider: VisionProvider;
  model: string;
  apiKey: string;
} | null {
  if (!selection) return null;
  return {
    provider: selection.provider,
    model: selection.model || getDefaultModel(selection.provider),
    apiKey: selection.key,
  };
}
