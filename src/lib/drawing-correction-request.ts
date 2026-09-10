export interface DrawingCorrectionRequest {
  targetDisplayId: string;
  selectedValue: string;
  correctionKind: 'text' | 'type' | 'label';
  expectedUpdatedAt: string;
  idempotencyKey: string;
}
export class CorrectionRequestError extends Error {
  constructor(public readonly status: 400 | 408 | 413 | 415, public readonly code: string, message: string) {
    super(message); this.name = 'CorrectionRequestError';
  }
}
const invalid = () => new CorrectionRequestError(400, 'INVALID_CORRECTION', '수정 대상, 종류, 문서 버전 및 요청 고유키가 필요합니다.');

/** Reconstruct validated fields; client candidates and provenance are not authority. */
export function parseDrawingCorrectionRequest(value: unknown): DrawingCorrectionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  if (typeof body.targetDisplayId !== 'string' || body.targetDisplayId.length > 128 || !/^P\d{2,}-[STL]\d{3,}$/.test(body.targetDisplayId)
    || typeof body.selectedValue !== 'string' || !body.selectedValue.trim() || body.selectedValue.length > 200 || /[\u0000-\u001f\u007f]/.test(body.selectedValue)
    || typeof body.correctionKind !== 'string' || !['text', 'type', 'label'].includes(body.correctionKind)
    || typeof body.expectedUpdatedAt !== 'string' || body.expectedUpdatedAt.length > 40 || !Number.isFinite(Date.parse(body.expectedUpdatedAt))
    || typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.idempotencyKey)) throw invalid();
  return { targetDisplayId: body.targetDisplayId, selectedValue: body.selectedValue.trim(),
    correctionKind: body.correctionKind as DrawingCorrectionRequest['correctionKind'],
    expectedUpdatedAt: body.expectedUpdatedAt, idempotencyKey: body.idempotencyKey };
}

/** Count received UTF-8 bytes, not the untrusted Content-Length header. */
export async function readDrawingCorrectionRequest(request: Request, maxBytes = 16_384, timeoutMs = 10_000): Promise<DrawingCorrectionRequest> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new CorrectionRequestError(415, 'JSON_REQUIRED', '수정 요청은 JSON 형식이어야 합니다.');
  }
  const tooLarge = () => new CorrectionRequestError(413, 'CORRECTION_TOO_LARGE', '수정 요청이 너무 큽니다. 내용을 줄여 다시 시도해 주세요.');
  const length = request.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) throw tooLarge();
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  // One bounded allocation; many tiny chunks cannot accumulate unbounded array overhead.
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  let failure: CorrectionRequestError | undefined;
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  void aborted.catch(() => undefined);
  const stop = () => {
    failure = new CorrectionRequestError(408, 'CORRECTION_INTERRUPTED', '수정 요청 수신이 중단됐습니다. 다시 시도해 주세요.');
    rejectAbort(failure); void reader.cancel().catch(() => undefined);
  };
  const timer = setTimeout(stop, timeoutMs);
  request.signal.addEventListener('abort', stop, { once: true });
  try {
    if (request.signal.aborted) stop();
    while (true) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (failure) throw failure;
      if (done) break;
      if (size + value.byteLength > maxBytes) { void reader.cancel().catch(() => undefined); throw tooLarge(); }
      bytes.set(value, size); size += value.byteLength;
    }
    let json: unknown;
    try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))); }
    catch { throw invalid(); }
    return parseDrawingCorrectionRequest(json);
  } catch (error) {
    if (error instanceof CorrectionRequestError) throw error;
    throw failure ?? invalid();
  } finally {
    clearTimeout(timer); request.signal.removeEventListener('abort', stop); reader.releaseLock();
  }
}

/** A reused key may replay the SAME action, not certify a different edit. */
export function matchesCorrectionReplay(existing: { targetDisplayId?: string; selectedValue?: string; correctionKind?: string }, next: DrawingCorrectionRequest): boolean {
  return existing.targetDisplayId === next.targetDisplayId && existing.selectedValue?.trim() === next.selectedValue
    && existing.correctionKind === next.correctionKind;
}
