import { isRecord, FeatureRequestError } from './feature-request';

export const NAMEPLATE_FIELDS = ['manufacturer','model','voltage','current','power','frequency','serialNumber','phase','rating','efficiency','powerFactor','rpm','insulation','protection'] as const;
export type NameplateField = typeof NAMEPLATE_FIELDS[number];
export interface NameplateReviewData extends Partial<Record<NameplateField, string>> { rawText: string; confidence: number; language: string }
export function decodeNameplateResponse(value: unknown): { data: NameplateReviewData; suggestedCalculators: string[] } {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) throw new FeatureRequestError('명판 분석 응답을 확인하지 못했습니다.');
  const source = value.data;
  if (typeof source.rawText !== 'string' || source.rawText.length > 100_000 || typeof source.language !== 'string'
    || typeof source.confidence !== 'number' || !Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 1) {
    throw new FeatureRequestError('명판 분석 필드 형식이 올바르지 않습니다.');
  }
  const data: NameplateReviewData = { rawText: source.rawText, confidence: source.confidence, language: source.language };
  for (const field of NAMEPLATE_FIELDS) {
    if (source[field] === undefined || source[field] === null) continue;
    if (typeof source[field] !== 'string' || source[field].length > 1000) throw new FeatureRequestError('명판 값의 형식 또는 길이를 확인해 주세요.');
    if (source[field].trim()) data[field] = source[field].trim();
  }
  const suggestedCalculators = Array.isArray(value.suggestedCalculators) ? value.suggestedCalculators.filter((item): item is string => typeof item === 'string' && /^[a-z0-9-]{1,80}$/.test(item)).slice(0, 30) : [];
  return { data, suggestedCalculators: [...new Set(suggestedCalculators)] };
}

/** This checks ambiguity, not whether the OCR value is true or engineering-approved. */
export function nameplateInputIssue(field: NameplateField, value: string | undefined): string | undefined {
  if (!value?.trim()) return '미기재 또는 미판독';
  if (['voltage','current','power','frequency','powerFactor','phase'].includes(field)
    && /[/?~–]|\d\s*-\s*\d|\d\s*(?:or|또는)\s*\d/i.test(value)) return '복수 값·범위·미확정 표기: 사용할 값을 원본에서 선택하세요.';
  if (field === 'current' && /kA(?![a-z])/i.test(value)) return 'kA 값은 차단용량일 수 있습니다. 부하전류로 자동 전달하지 않습니다.';
  if (field === 'power' && /(?:kVA|MVA|VAR|Wh)(?![a-z])/i.test(value)) return '피상·무효전력 또는 전력량을 유효전력으로 자동 전달하지 않습니다.';
  return undefined;
}
export function nameplateCalculatorInputs(data: NameplateReviewData, calculatorId: string): Record<string, unknown> {
  const inputs: Record<string, unknown> = { source: 'ocr', calc: calculatorId };
  for (const field of ['voltage','current','power','powerFactor','phase','frequency'] as const) {
    if (!nameplateInputIssue(field, data[field])) inputs[field] = data[field];
  }
  return inputs;
}
