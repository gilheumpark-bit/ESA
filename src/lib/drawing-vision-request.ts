import { isCatalogModel } from '@/lib/ai-providers';
import { getChatGPTLocalStatus } from '@/lib/chatgpt-local';
import { assertLoopbackRequest } from '@/lib/chatgpt-local-loopback';
import {
  isDrawingReasoningEffort,
  parseDrawingEffortProfile,
  type DrawingEffortProfile,
  type DrawingReasoningEffort,
} from '@/lib/drawing-reasoning-effort';

export type DrawingVisionRequest =
  | {
      provider: 'gemini' | 'google-agent-platform' | 'openai' | 'claude';
      apiKey: string;
      model?: string;
      effort?: DrawingReasoningEffort;
      effortProfile?: DrawingEffortProfile;
    }
  | {
      provider: 'chatgpt-local';
      model: string;
      effort?: DrawingReasoningEffort;
      effortProfile?: DrawingEffortProfile;
    };

type RemoteVisionProvider = Exclude<DrawingVisionRequest['provider'], 'chatgpt-local'>;

const REMOTE_PROVIDERS = new Set<RemoteVisionProvider>([
  'gemini',
  'google-agent-platform',
  'openai',
  'claude',
]);
const MODEL_PATTERN = /^[a-zA-Z0-9._:/-]{1,128}$/;

export class DrawingVisionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DrawingVisionRequestError';
  }
}

function serverKey(provider: RemoteVisionProvider): string {
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? '';
  if (provider === 'claude') return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  if (provider === 'google-agent-platform') return process.env.GOOGLE_VERTEX_API_KEY?.trim() ?? '';
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? '';
}

export async function resolveDrawingVisionRequest(
  form: FormData,
  request: Pick<Request, 'headers' | 'url'>,
  authenticated: boolean,
): Promise<DrawingVisionRequest | undefined> {
  const providerRaw = String(form.get('provider') ?? 'gemini');
  const model = String(form.get('model') ?? '').trim();
  const effortRaw = String(form.get('effort') ?? '').trim();
  if (model && !MODEL_PATTERN.test(model)) {
    throw new DrawingVisionRequestError('Vision 모델 이름 형식이 올바르지 않습니다.', 400);
  }
  if (effortRaw && !isDrawingReasoningEffort(effortRaw)) {
    throw new DrawingVisionRequestError('도면 추론 단계는 low, medium, high, xhigh, max 중 하나여야 합니다.', 400);
  }
  const effort: DrawingReasoningEffort | undefined = effortRaw
    ? effortRaw as DrawingReasoningEffort
    : undefined;

  // 역할별 단계는 선택 입력이다. 알 수 없는 역할·단계는 조용히 버리지 않고
  // 400 으로 닫는다 — 요청한 프로필과 실제 호출이 어긋나면 A/B 가 거짓말이 된다.
  let effortProfile: DrawingEffortProfile | undefined;
  try {
    effortProfile = parseDrawingEffortProfile(String(form.get('effortProfile') ?? '').trim());
  } catch {
    throw new DrawingVisionRequestError(
      '역할별 도면 추론 프로필 형식이 올바르지 않습니다. 역할은 symbols, connections, text, logic, coverage-auditor 중 하나여야 합니다.',
      400,
    );
  }
  const profileFields = effortProfile ? { effortProfile } : {};

  if (providerRaw === 'chatgpt-local') {
    try {
      assertLoopbackRequest(request);
    } catch {
      throw new DrawingVisionRequestError('Not found', 404);
    }
    const status = await getChatGPTLocalStatus();
    if (!status.available) {
      throw new DrawingVisionRequestError('로컬 Codex를 사용할 수 없습니다.', 503);
    }
    if (!status.connected) {
      throw new DrawingVisionRequestError('ChatGPT 계정 연결이 필요합니다.', 401);
    }
    const selected = model
      ? status.models.find((candidate) => candidate.id === model)
      : status.models.find((candidate) => candidate.inputModalities.includes('image'));
    if (!selected?.inputModalities.includes('image')) {
      throw new DrawingVisionRequestError('선택한 ChatGPT 모델은 이미지 분석에 사용할 수 없습니다.', 400);
    }
    return {
      provider: 'chatgpt-local',
      model: selected.id,
      ...(effort ? { effort } : {}),
      ...profileFields,
    };
  }

  if (!REMOTE_PROVIDERS.has(providerRaw as RemoteVisionProvider)) {
    throw new DrawingVisionRequestError('지원하지 않는 Vision 제공자입니다.', 400);
  }
  const provider = providerRaw as RemoteVisionProvider;
  if (effort === 'xhigh' || effort === 'max') {
    throw new DrawingVisionRequestError('xhigh와 max 도면 추론은 로컬 ChatGPT 모델에서만 사용할 수 있습니다.', 400);
  }
  const suppliedKey = String(form.get('apiKey') ?? '').trim();
  if (suppliedKey.length > 4096) {
    throw new DrawingVisionRequestError('Vision 키 형식이 올바르지 않습니다.', 400);
  }
  if (!suppliedKey && !authenticated) {
    throw new DrawingVisionRequestError('비로그인 도면 분석에는 Vision BYOK 키가 필요합니다.', 401);
  }
  if (model && !suppliedKey && !isCatalogModel(provider, model)) {
    throw new DrawingVisionRequestError('서버 Vision 키로 사용할 수 없는 모델입니다.', 400);
  }
  const apiKey = suppliedKey || serverKey(provider);
  return apiKey
    ? { provider, apiKey, model: model || undefined, ...(effort ? { effort } : {}), ...profileFields }
    : undefined;
}
