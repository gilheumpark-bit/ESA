import { isRecord, requireRecord, unwrapFeatureResponse, FeatureRequestError } from './feature-request';
export interface HistoryRecord {
  id: string; calcId: string; userId?: string; calculatedAt: string; inputs: Record<string, unknown>;
  result?: { value?: unknown; unit?: string; judgment?: { pass?: boolean | null } };
}
function parse(value: unknown): HistoryRecord {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.calcId !== 'string'
    || typeof value.calculatedAt !== 'string' || !isRecord(value.inputs)
    || (value.userId !== undefined && typeof value.userId !== 'string')
    || (value.result !== undefined && !isRecord(value.result))) throw new FeatureRequestError('계산 이력 형식 오류');
  const result = value.result as HistoryRecord['result'];
  if (result && ((result.unit !== undefined && typeof result.unit !== 'string') || (result.judgment !== undefined && !isRecord(result.judgment)))) throw new FeatureRequestError('계산 결과 형식 오류');
  return { id: value.id, calcId: value.calcId, userId: value.userId as string | undefined,
    calculatedAt: value.calculatedAt, inputs: value.inputs, result };
}
export function cachedHistory(storage: Pick<Storage, 'getItem'>, uid?: string): { records: HistoryRecord[]; skipped: number } {
  const raw = storage.getItem('esa-receipt-index');
  if (raw === null) return { records: [], skipped: 0 };
  if (raw.length > 1_000_000) throw new FeatureRequestError('계산 이력 색인이 너무 큽니다. 원본을 삭제하지 않았습니다.');
  let ids: unknown;
  try { ids = JSON.parse(raw); } catch { throw new FeatureRequestError('계산 이력 색인이 손상됐습니다. 원본을 삭제하지 않았습니다.'); }
  if (!Array.isArray(ids) || ids.length > 10000 || !ids.every((id) => typeof id === 'string' && id.length <= 128)) throw new FeatureRequestError('계산 이력 색인 형식을 확인해 주세요.');
  const records: HistoryRecord[] = []; let skipped = 0;
  for (const id of new Set(ids)) {
    try {
      const data = storage.getItem(`esa-receipt-${id}`);
      if (!data || data.length > 2_000_000) { skipped++; continue; }
      const receipt = parse(JSON.parse(data));
      if (receipt.id !== id) { skipped++; continue; }
      // Local anonymous work is usable; another signed-in user's record is not.
      if (receipt.userId && receipt.userId !== 'anonymous' && receipt.userId !== uid) continue;
      records.push(receipt);
    } catch { skipped++; }
  }
  return { records, skipped };
}
export function decodeHistoryRows(value: unknown): HistoryRecord[] {
  const body = requireRecord(unwrapFeatureResponse(value));
  if (!Array.isArray(body.data) || body.data.length > 1000) throw new FeatureRequestError('계정 이력 조회 형식 오류');
  return body.data.map((raw) => {
    const row = requireRecord(raw);
    return parse({ id: row.id, calcId: row.calculator_id, userId: row.user_id,
      inputs: row.inputs, result: row.outputs, calculatedAt: row.calculated_at ?? row.created_at ?? '' });
  });
}
