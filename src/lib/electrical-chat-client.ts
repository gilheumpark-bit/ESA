'use client';

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

export async function resolveBrowserChatTransport(): Promise<ChatTransport> {
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
    const response = await fetch('/api/settings/chatgpt-local', {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as {
      data?: import('@/lib/chatgpt-local-contract').ChatGPTLocalStatus;
    } | null;
    const status = payload?.data;
    if (!response.ok || !status?.available) {
      throw new Error('로컬 Codex를 사용할 수 없습니다. 설치 상태를 확인해 주세요.');
    }
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

  const decoder = new TextDecoder();
  let text = '';
  let remainder = '';
  let calculation: ElectricalCalculationReceipt | undefined;
  let doneEvent = false;

  const applyLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') {
      doneEvent = true;
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (typeof payload.error === 'string') throw new Error(payload.error);
    if (payload.calculation && typeof payload.calculation === 'object') {
      const receipt = payload.calculation as Record<string, unknown>;
      if (typeof receipt.calculatorId === 'string' && typeof receipt.calculatorName === 'string') {
        calculation = receipt as unknown as ElectricalCalculationReceipt;
      }
    }
    if (typeof payload.text === 'string') {
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

  while (!doneEvent) {
    const { done, value } = await reader.read();
    if (done) break;
    const split = splitCompleteSseLines(remainder, decoder.decode(value, { stream: true }));
    remainder = split.remainder;
    for (const line of split.lines) {
      applyLine(line);
      if (doneEvent) break;
    }
  }

  const tail = splitCompleteSseLines(remainder, `${decoder.decode()}\n`);
  for (const line of tail.lines) applyLine(line);

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
  const transport = await resolveBrowserChatTransport();
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
