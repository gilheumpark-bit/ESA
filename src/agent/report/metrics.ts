import { createHash, createPublicKey, verify } from 'node:crypto';

/**
 * ⚠ 이 파일의 채점 절반(`precisionRecallF1`·`evaluateGoldenPrediction`·`ratio`)은
 * **휴면**이다. 운영 호출처가 없다(실측 2026-07-29 · 리포 전수 3 파일 = 자기
 * 자신·자기 테스트·계획 문서).
 *
 *   상태      휴면 — 계획 `docs/superpowers/plans/2026-07-20-sld-report-and-95-validation.md`
 *             의 명세대로 만들어졌으나 소비처 배선 단계가 안 끝났다.
 *   실제 채점 `agent/drawing/sld-evaluator-v2.ts` 가 예측에서 직접 계산하고,
 *             `scripts/sld-golden-gate.mjs` 는 서명된 payload 의 수치를 읽는다.
 *   재활성    영수증 파이프라인이 "집계된 개수"로 채점해야 할 때.
 *   재검토    그때 아래 함정을 먼저 고칠 것.
 *
 * 함정: `evaluateGoldenPrediction` 의 macro-F1 은 호출자가 넘긴 `symbolsByType`
 * 키를 그대로 평균한다. tp=fp=fn=0 인 종류를 하나 끼워 넣으면 그 항이 1.0 이
 * 되어 평균을 끌어올린다. 운영 구현(`sld-evaluator-v2`)은 종류 집합을
 * 예측∪정답으로 만들어 0/0 항이 아예 생기지 않는다 — 두 구현이 이 지점에서
 * 갈린다. 배선한다면 이쪽을 운영 쪽에 맞춰야 한다.
 *
 * 살아 있는 것은 `verifyGoldenGateReceiptSignature` 하나뿐이다(golden-gate.ts).
 */

export interface PRF1 {
  precision: number;
  recall: number;
  f1: number;
}

export interface GoldenCounts {
  symbolsByType: Record<string, { tp: number; fp: number; fn: number }>;
  textFields: { correct: number; total: number };
  edges: { tp: number; fp: number; fn: number };
  junctionsAndCrossovers: { correct: number; total: number };
  criticalLogicIssues: { found: number; total: number };
  unsupportedPassCount: number;
  claims: { traced: number; total: number };
}

export interface GoldenMetrics {
  symbolMacroF1: number;
  textFieldAccuracy: number;
  edgeF1: number;
  junctionAccuracy: number;
  criticalLogicRecall: number;
  unsupportedPassCount: number;
  claimTraceability: number;
}

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
}

function ratio(correct: number, total: number, label: string): number {
  assertCount(correct, `${label}.correct`);
  assertCount(total, `${label}.total`);
  if (correct > total) throw new RangeError(`${label}.correct must not exceed total.`);
  return total === 0 ? 1 : correct / total;
}

export function precisionRecallF1(tp: number, fp: number, fn: number): PRF1 {
  assertCount(tp, 'tp');
  assertCount(fp, 'fp');
  assertCount(fn, 'fn');
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1Denominator = 2 * tp + fp + fn;
  const f1 = f1Denominator === 0 ? 1 : (2 * tp) / f1Denominator;
  return { precision, recall, f1 };
}

export function evaluateGoldenPrediction(input: GoldenCounts): GoldenMetrics {
  assertCount(input.unsupportedPassCount, 'unsupportedPassCount');
  const symbolScores = Object.entries(input.symbolsByType)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([, counts]) => precisionRecallF1(counts.tp, counts.fp, counts.fn).f1);
  return {
    symbolMacroF1: symbolScores.length === 0
      ? 1
      : symbolScores.reduce((sum, value) => sum + value, 0) / symbolScores.length,
    textFieldAccuracy: ratio(input.textFields.correct, input.textFields.total, 'textFields'),
    edgeF1: precisionRecallF1(input.edges.tp, input.edges.fp, input.edges.fn).f1,
    junctionAccuracy: ratio(
      input.junctionsAndCrossovers.correct,
      input.junctionsAndCrossovers.total,
      'junctionsAndCrossovers',
    ),
    criticalLogicRecall: ratio(
      input.criticalLogicIssues.found,
      input.criticalLogicIssues.total,
      'criticalLogicIssues',
    ),
    unsupportedPassCount: input.unsupportedPassCount,
    claimTraceability: ratio(input.claims.traced, input.claims.total, 'claims'),
  };
}

function canonicalizeReceipt(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeReceipt).join(',')}]`;
  if (typeof value !== 'object') return 'null';
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalizeReceipt(record[key])}`).join(',')}}`;
}

/**
 * A 95% badge consumer must verify an externally signed receipt instead of trusting
 * a mutable local JSON boolean. The public key fingerprint is part of the
 * signed claim and is checked again against the supplied pinned key.
 */
export function verifyGoldenGateReceiptSignature(receipt: unknown, publicKeyPem: string): boolean {
  try {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
    const { receiptAttestation, ...claim } = receipt as Record<string, unknown>;
    if (!receiptAttestation || typeof receiptAttestation !== 'object' || Array.isArray(receiptAttestation)) return false;
    const attestation = receiptAttestation as Record<string, unknown>;
    if (
      attestation.algorithm !== 'ed25519'
      || typeof attestation.keyFingerprint !== 'string'
      || !/^[a-f0-9]{64}$/.test(attestation.keyFingerprint)
      || typeof attestation.signature !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature)
      || claim.verified95 !== true
    ) return false;
    const publicKey = createPublicKey(publicKeyPem);
    const fingerprint = createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    if (fingerprint !== attestation.keyFingerprint) return false;
    const signature = Buffer.from(attestation.signature, 'base64');
    return signature.length === 64
      && verify(null, Buffer.from(canonicalizeReceipt(claim)), publicKey, signature);
  } catch {
    return false;
  }
}
