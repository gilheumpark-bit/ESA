'use client';

import { requestFeatureJson, requireRecord } from './feature-request';
import type { ChatMessage } from '@/lib/ai-providers';
import { getDefaultModel } from '@/lib/ai-providers';
import { splitCompleteSseLines } from '@/lib/sse-line-buffer';
import { ELECTRICAL_CHAT_MAX_TOKENS } from '@/lib/electrical-chat';

export interface ElectricalCalculationReceipt {
  calculatorId: string;
  calculatorName: string;
  input?: Record<string, unknown>;
  result?: unknown;
}

export interface ElectricalChatResponse {
  text: string;
  calculation?: ElectricalCalculationReceipt;
}

type ChatFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ChatTransport {
  fetcher: ChatFetcher;
  providerBody: Record<string, unknown>;
}

export async function resolveBrowserChatTransport(signal?: AbortSignal): Promise<ChatTransport> {
  signal?.throwIfAborted();
  const onpremiseStorage = await import('@/lib/onpremise-storage');
  const raw = typeof window === 'undefined' ? null : sessionStorage.getItem('esva-onpremise');
  if (raw) {
    const onprem = await onpremiseStorage.decodeOnPremiseConfig(raw);
    if (onprem.enabled && onprem.serverUrl && onprem.modelName) {
      const { authenticatedFetch } = await import('@/lib/client-auth');
      return {
        fetcher: authenticatedFetch,
        providerBody: {
          provider: 'onpremise',
          model: onprem.modelName,
          onpremise: {
            serverUrl: onprem.serverUrl,
            apiType: onprem.apiType,
            apiKey: onprem.apiKey || undefined,
          },
        },
      };
    }
  }

  const localSelection = await import('@/lib/chatgpt-local-selection');
  const selectedLocal = localSelection.loadChatGPTLocalSelection();
  if (selectedLocal.enabled) {
    const status = await requestFeatureJson('/api/settings/chatgpt-local', { signal }, (value) => {
      const body = requireRecord(requireRecord(value).data);
      if (typeof body.available !== 'boolean' || typeof body.connected !== 'boolean' || !Array.isArray(body.models)) {
        throw new Error('로컬 계정 상태 응답을 확인하지 못했습니다.');
      }
      return body as unknown as import('@/lib/chatgpt-local-contract').ChatGPTLocalStatus;
    }).catch((error: unknown) => {
      signal?.throwIfAborted();
      const unavailable = error instanceof Error && 'status' in error && error.status === 503;
      throw new Error(`계정 상태 확인 실패: ${unavailable ? '로컬 Codex를 사용할 수 없습니다. ' : ''}${error instanceof Error ? error.message : '로컬 연결을 확인해 주세요.'}`);
    });
    if (!status.available) throw new Error('로컬 Codex를 사용할 수 없습니다. 설치 상태를 확인해 주세요.');
    if (!status.connected) {
      throw new Error('ChatGPT 계정 연결이 끊겼습니다. AI 연결 관리에서 다시 연결해 주세요.');
    }
    const model = localSelection.resolveChatGPTLocalModel(
      selectedLocal,
      status.models,
      'text',
    );
    if (!model) {
      throw new Error('현재 ChatGPT 계정에 텍스트 입력 모델이 없습니다.');
    }
    return {
      fetcher: (input, init) => fetch(input, init),
      providerBody: {
        provider: 'chatgpt-local',
        model,
      },
    };
  }

  const visionByok = await import('@/lib/vision-byok');
  const browserByok = visionByok.buildVisionChatRequest(
    await visionByok.getFirstAvailableVisionKey(),
  );
  return {
    // 맨 `fetch` 를 객체 속성에 담으면 `transport.fetcher(...)` 로 부를 때
    // this 가 transport 가 되어 브라우저가 거부한다 —
    // "Failed to execute 'fetch' on 'Window': Illegal invocation".
    // 그 문자열이 그대로 답변 자리에 찍혔다(실측 2026-07-26, /tools/studio).
    // 서버 경유 게이트(gate:chat-live)는 이 경로를 타지 않아 초록이었다.
    fetcher: (input, init) => fetch(input, init),
    providerBody: browserByok ?? {
      provider: 'openai',
      model: process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL || getDefaultModel('openai'),
    },
  };
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (record.error && typeof record.error === 'object') {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

export async function readElectricalChatResponse(
  response: Response,
  onUpdate?: (text: string) => void,
): Promise<ElectricalChatResponse> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(errorMessageFromPayload(payload, `AI 응답 실패 (${response.status})`));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI 응답 스트림을 열 수 없습니다.');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let remainder = '';
  let calculation: ElectricalCalculationReceipt | undefined;
  let doneEvent = false;

  const applyLine = (line: string) => {
    if (doneEvent || !line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw) return;
    if (raw === '[DONE]') {
      doneEvent = true;
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch { throw new Error('AI 응답 일부가 손상됐습니다. 완료된 답변으로 처리하지 않았습니다.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('AI 응답 형식 오류');

    if (payload.error) throw new Error(errorMessageFromPayload(payload, 'AI 공급자 응답 오류'));
    if (payload.calculation && typeof payload.calculation === 'object') {
      const receipt = payload.calculation as Record<string, unknown>;
      if (typeof receipt.calculatorId === 'string' && typeof receipt.calculatorName === 'string') {
        calculation = receipt as unknown as ElectricalCalculationReceipt;
      }
    }
    if (typeof payload.text === 'string') {
      if (text.length + payload.text.length > 1_048_576) throw new Error('AI 응답 크기 제한 초과');
      text += payload.text;
      onUpdate?.(text);
    }

    if (payload.filter && typeof payload.filter === 'object') {
      const filter = payload.filter as Record<string, unknown>;
      if (filter.passed === false && typeof filter.filteredText === 'string') {
        const notice = typeof filter.notice === 'string' ? `\n\n[주의] ${filter.notice}` : '';
        text = `${filter.filteredText}${notice}`;
        onUpdate?.(text);
      }
    }
  };

  try {
    while (!doneEvent) {
      const { done, value } = await reader.read();
      if (done) break;
      const split = splitCompleteSseLines(remainder, decoder.decode(value, { stream: true }));
      remainder = split.remainder;
      if (remainder.length > 1_048_576) throw new Error('AI 응답 프레임 크기 제한 초과');
      for (const line of split.lines) { applyLine(line); if (doneEvent) break; }
    }
    if (!doneEvent) {
      const tail = splitCompleteSseLines(remainder, `${decoder.decode()}\n`);
      for (const line of tail.lines) { applyLine(line); if (doneEvent) break; }
    }
    if (!doneEvent) throw new Error('AI 응답이 완료되기 전에 연결이 끊겼습니다. 일부 답변을 확정 결과로 사용하지 마세요.');
  } finally {
    try { await reader.cancel(); } catch { /* Preserve the original provider/transport error. */ }
    reader.releaseLock();
  }

  if (!text.trim()) throw new Error('AI가 빈 답변을 반환했습니다. 공급자와 모델 설정을 확인해 주세요.');
  return { text, calculation };
}

export async function requestElectricalChat(
  messages: ChatMessage[],
  language: 'ko' | 'en',
  options: {
    signal?: AbortSignal;
    onUpdate?: (text: string) => void;
  } = {},
): Promise<ElectricalChatResponse> {
  options.signal?.throwIfAborted();
  const transport = await resolveBrowserChatTransport(options.signal);
  options.signal?.throwIfAborted();
  const response = await transport.fetcher('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      ...transport.providerBody,
      language,
      temperature: 0.2,
      maxTokens: ELECTRICAL_CHAT_MAX_TOKENS,
    }),
    signal: options.signal,
  });

  return readElectricalChatResponse(response, options.onUpdate);
}
