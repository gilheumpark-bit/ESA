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

interface ChatTransport {
  fetcher: ChatFetcher;
  providerBody: Record<string, unknown>;
}

async function resolveBrowserChatTransport(): Promise<ChatTransport> {
  const [onpremiseStorage, visionByok] = await Promise.all([
    import('@/lib/onpremise-storage'),
    import('@/lib/vision-byok'),
  ]);

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

  const browserByok = visionByok.buildVisionChatRequest(
    await visionByok.getFirstAvailableVisionKey(),
  );
  return {
    fetcher: fetch,
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
