/** Shared boundary for interactive feature requests. Never retries mutations. */
export class FeatureRequestError extends Error {
  constructor(message: string, public readonly status = 0, public readonly retryAfterSeconds?: number) {
    super(message); this.name = 'FeatureRequestError';
  }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new FeatureRequestError('응답 형식이 올바르지 않습니다. 다시 시도해 주세요.');
  return value;
}
export function requireArray<T>(value: unknown, valid: (item: unknown) => item is T, limit = 2000): T[] {
  if (!Array.isArray(value) || value.length > limit || !value.every(valid)) throw new FeatureRequestError('목록 응답을 확인하지 못했습니다. 빈 목록으로 처리하지 않았습니다.');
  return value;
}
export function retryDelay(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 3600) : undefined;
}
function responseMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  const error = body.error;
  const message = typeof error === 'string' ? error : isRecord(error) ? error.message : undefined;
  return typeof message === 'string' && message.trim() ? message.replace(/[\u0000-\u001f]/g, ' ').slice(0, 300) : fallback;
}
export function unwrapFeatureResponse(body: unknown): unknown {
  const value = requireRecord(body);
  if (value.success === false) throw new FeatureRequestError(responseMessage(value, '요청을 완료하지 못했습니다.'));
  return Object.hasOwn(value, 'data') ? value.data : value;
}

/** Time limit includes token retrieval and response decoding, not just headers.
 * The caller's signal is propagated; even a non-cooperating transport cannot
 * keep the UI pending forever. Its late promise is observed and discarded. */
export async function requestFeatureJson<T>(url: string, init: RequestInit, decode: (value: unknown) => T,
  transport: typeof fetch = fetch, timeoutMs = 20_000): Promise<T> {
  if (!/^\/api\/(?!\/)/.test(url) || /[\\\u0000-\u001f]/.test(url)) throw new FeatureRequestError('내부 API 주소만 사용할 수 있습니다.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new FeatureRequestError('요청 제한시간 설정 오류');
  const controller = new AbortController();
  let timedOut = false, rejectStop!: (reason: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
  void stopped.catch(() => undefined);
  const cancel = () => { controller.abort(); rejectStop(new DOMException('Request cancelled', 'AbortError')); };
  init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true; controller.abort(); rejectStop(new FeatureRequestError('응답이 지연되고 있습니다. 다시 시도해 주세요.'));
  }, timeoutMs);
  try {
    if (init.signal?.aborted) cancel();
    const execute = async () => {
      controller.signal.throwIfAborted();
      const response = await transport(url, { ...init, signal: controller.signal, cache: 'no-store' });
      controller.signal.throwIfAborted();
      let body: unknown;
      try { body = await response.json(); } catch { throw new FeatureRequestError('서버 응답을 읽지 못했습니다. 다시 시도해 주세요.', response.status); }
      controller.signal.throwIfAborted();
      if (!response.ok || (isRecord(body) && body.success === false)) {
        const fallback = response.status === 401 ? '로그인이 필요합니다.' : response.status === 403 ? '이 작업에 대한 권한이 없습니다.'
          : response.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : '요청을 완료하지 못했습니다.';
        throw new FeatureRequestError(responseMessage(body, fallback), response.status, retryDelay(response.headers.get('retry-after')));
      }
      return decode(body);
    };
    return await Promise.race([execute(), stopped]);
  } catch (error) {
    if (timedOut) throw new FeatureRequestError('응답이 지연되고 있습니다. 다시 시도해 주세요.');
    if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (error instanceof FeatureRequestError) throw error;
    throw new FeatureRequestError('서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
  } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', cancel); }
}

/** Presentation only; never infer an absent timestamp as a new activity. */
export function relativeActivityTime(value: string, now = Date.now()): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '기록 시각 미확인';
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < -1) return '미래 시각 · 확인 필요';
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
