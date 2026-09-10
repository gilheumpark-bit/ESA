import { requestFeatureJson, requireRecord, FeatureRequestError } from './feature-request';
import { loadSelectedModel, loadStoredProviderKey } from '@/lib/byok-storage';
import { getDefaultModel } from '@/lib/ai-providers';
import {
  loadChatGPTLocalSelection,
  resolveChatGPTLocalModel,
} from '@/lib/chatgpt-local-selection';
import type { ChatGPTLocalStatus } from '@/lib/chatgpt-local-contract';

export type RemoteVisionProvider = 'openai' | 'claude' | 'gemini' | 'google-agent-platform';
export type VisionProvider = RemoteVisionProvider | 'chatgpt-local';

export interface VisionByokSelection {
  provider: VisionProvider;
  key: string;
  model: string;
}

const REMOTE_VISION_PROVIDERS: readonly RemoteVisionProvider[] = [
  'openai',
  'claude',
  'gemini',
  'google-agent-platform',
];
const VISION_PROVIDERS: readonly VisionProvider[] = ['chatgpt-local', ...REMOTE_VISION_PROVIDERS];
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
  signal?: AbortSignal,
): Promise<VisionByokSelection | null> {
  signal?.throwIfAborted();
  if (typeof window === 'undefined') return null;

  if (allowedProviders.includes('chatgpt-local')) {
    const selection = loadChatGPTLocalSelection();
    if (selection.enabled) {
      const status = await requestFeatureJson('/api/settings/chatgpt-local', { signal }, (value) => {
        const data = requireRecord(requireRecord(value).data);
        if (typeof data.available !== 'boolean' || typeof data.connected !== 'boolean' || !Array.isArray(data.models)) throw new FeatureRequestError('로컬 AI 상태 응답을 확인하지 못했습니다.');
        return data as unknown as ChatGPTLocalStatus;
      }).catch((error: unknown) => {
      signal?.throwIfAborted();
      const unavailable = error instanceof Error && 'status' in error && error.status === 503;
      throw new Error(`계정 상태 확인 실패: ${unavailable ? '로컬 Codex를 사용할 수 없습니다. ' : ''}${error instanceof Error ? error.message : '로컬 연결을 확인해 주세요.'}`);
    });
      if (!status.available) throw new Error('로컬 Codex를 사용할 수 없습니다. 설치 상태를 확인해 주세요.');
      if (!status.connected) {
        throw new Error('ChatGPT 계정 연결이 끊겼습니다. AI 연결 관리에서 다시 연결해 주세요.');
      }
      const model = resolveChatGPTLocalModel(selection, status.models, 'image');
      if (model) return { provider: 'chatgpt-local', key: '', model };
      throw new Error('선택한 로컬 모델에서 이미지 입력을 확인하지 못했습니다. 설정에서 사용할 연결을 직접 선택하세요. 다른 공급자로 자동 전환하지 않았습니다.');
    }
  }

  for (const provider of REMOTE_VISION_PROVIDERS.filter((candidate) => (
    allowedProviders.includes(candidate)
  ))) {
    try {
      signal?.throwIfAborted();
      const key = await loadStoredProviderKey(provider);
      signal?.throwIfAborted();
      if (key) {
        return { provider, key, model: resolveSelectedModel(provider) };
      }
    } catch {
      signal?.throwIfAborted();
      // 손상되거나 없는 키 하나가 다른 제공자 확인을 막아서는 안 된다.
    }
  }
  return null;
}

/** Convert a browser Vision BYOK selection into the /api/chat request contract. */
export function buildVisionChatRequest(selection: VisionByokSelection | null): {
  provider: VisionProvider;
  model: string;
  apiKey?: string;
} | null {
  if (!selection) return null;
  if (selection.provider === 'chatgpt-local') {
    return {
      provider: selection.provider,
      model: selection.model,
    };
  }
  return {
    provider: selection.provider,
    model: selection.model || getDefaultModel(selection.provider),
    apiKey: selection.key,
  };
}
