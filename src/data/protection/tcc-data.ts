/**
 * TCC (Time-Current Curve) 보호 협조 데이터
 * --------------------------------------------
 * 차단기/퓨즈/계전기의 시간-전류 특성 곡선 데이터.
 * 설계 엔지니어가 보호 협조(selectivity) 검증에 사용.
 *
 * 데이터 = 제조사 공개 카탈로그 기준값 (사실 정보).
 * 정밀 TCC 분석은 ETAP/SKM 사용 권장.
 *
 * PART 1: MCCB 특성
 * PART 2: ACB 특성
 * PART 3: Fuse 특성
 * PART 4: OCR (과전류 계전기) 특성
 * PART 5: 보호 협조 검증
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TCCPoint {
  /** 전류 배수 (정격전류 대비) */
  currentMultiple: number;
  /** 동작 시간 (초) — 최소 */
  timeMin_s: number;
  /** 동작 시간 (초) — 최대 */
  timeMax_s: number;
}

export interface TCCDevice {
  id: string;
  type: 'MCCB' | 'ACB' | 'fuse' | 'OCR';
  manufacturer: string;
  model: string;
  ratingA: number;
  /** 순시 트립 배수 (정격전류 대비) */
  instantaneousMultiple?: number;
  /** 차단용량 (kA) */
  breakingCapacity_kA: number;
  /** TCC 곡선 포인트 */
  curve: TCCPoint[];
  /** 조정 범위 */
  adjustable?: { longDelay?: string; shortDelay?: string; instantaneous?: string };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — MCCB 특성 (역한시)
// ═══════════════════════════════════════════════════════════════════════════════

export const MCCB_TCC: TCCDevice[] = [
  {
    id: 'MCCB-100AF',
    type: 'MCCB',
    manufacturer: 'Generic',
    model: '100AF / 100AT',
    ratingA: 100,
    instantaneousMultiple: 10,
    breakingCapacity_kA: 25,
    curve: [
      { currentMultiple: 1.05, timeMin_s: 7200, timeMax_s: 7200 },
      { currentMultiple: 1.3, timeMin_s: 60, timeMax_s: 120 },
      { currentMultiple: 1.5, timeMin_s: 20, timeMax_s: 60 },
      { currentMultiple: 2.0, timeMin_s: 8, timeMax_s: 20 },
      { currentMultiple: 3.0, timeMin_s: 3, timeMax_s: 8 },
      { currentMultiple: 5.0, timeMin_s: 0.8, timeMax_s: 3 },
      { currentMultiple: 8.0, timeMin_s: 0.02, timeMax_s: 0.1 },
      { currentMultiple: 10.0, timeMin_s: 0.01, timeMax_s: 0.04 },
    ],
  },
  {
    id: 'MCCB-225AF',
    type: 'MCCB',
    manufacturer: 'Generic',
    model: '225AF / 200AT',
    ratingA: 200,
    instantaneousMultiple: 10,
    breakingCapacity_kA: 35,
    curve: [
      { currentMultiple: 1.05, timeMin_s: 7200, timeMax_s: 7200 },
      { currentMultiple: 1.3, timeMin_s: 60, timeMax_s: 120 },
      { currentMultiple: 1.5, timeMin_s: 20, timeMax_s: 60 },
      { currentMultiple: 2.0, timeMin_s: 8, timeMax_s: 25 },
      { currentMultiple: 3.0, timeMin_s: 3, timeMax_s: 10 },
      { currentMultiple: 5.0, timeMin_s: 0.8, timeMax_s: 4 },
      { currentMultiple: 8.0, timeMin_s: 0.02, timeMax_s: 0.15 },
      { currentMultiple: 10.0, timeMin_s: 0.01, timeMax_s: 0.05 },
    ],
  },
  {
    id: 'MCCB-400AF',
    type: 'MCCB',
    manufacturer: 'Generic',
    model: '400AF / 400AT',
    ratingA: 400,
    instantaneousMultiple: 8,
    breakingCapacity_kA: 50,
    curve: [
      { currentMultiple: 1.05, timeMin_s: 7200, timeMax_s: 7200 },
      { currentMultiple: 1.3, timeMin_s: 80, timeMax_s: 150 },
      { currentMultiple: 2.0, timeMin_s: 10, timeMax_s: 30 },
      { currentMultiple: 3.0, timeMin_s: 4, timeMax_s: 12 },
      { currentMultiple: 5.0, timeMin_s: 1, timeMax_s: 5 },
      { currentMultiple: 8.0, timeMin_s: 0.02, timeMax_s: 0.2 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — ACB 특성 (전자 트립)
// ═══════════════════════════════════════════════════════════════════════════════

export const ACB_TCC: TCCDevice[] = [
  {
    id: 'ACB-800AF',
    type: 'ACB',
    manufacturer: 'Generic',
    model: '800AF / 800AT Electronic Trip',
    ratingA: 800,
    breakingCapacity_kA: 65,
    curve: [
      { currentMultiple: 1.05, timeMin_s: 300, timeMax_s: 600 },
      { currentMultiple: 1.2, timeMin_s: 60, timeMax_s: 300 },
      { currentMultiple: 2.0, timeMin_s: 10, timeMax_s: 60 },
      { currentMultiple: 4.0, timeMin_s: 1, timeMax_s: 10 },
      { currentMultiple: 6.0, timeMin_s: 0.1, timeMax_s: 1 },
      { currentMultiple: 8.0, timeMin_s: 0.04, timeMax_s: 0.4 },
      { currentMultiple: 12.0, timeMin_s: 0.01, timeMax_s: 0.05 },
    ],
    adjustable: {
      longDelay: '0.5~1.0 × In, 4~24s',
      shortDelay: '1.5~10 × In, 0.1~0.4s',
      instantaneous: '2~15 × In',
    },
  },
  {
    id: 'ACB-1600AF',
    type: 'ACB',
    manufacturer: 'Generic',
    model: '1600AF / 1600AT Electronic Trip',
    ratingA: 1600,
    breakingCapacity_kA: 85,
    curve: [
      { currentMultiple: 1.05, timeMin_s: 300, timeMax_s: 600 },
      { currentMultiple: 1.2, timeMin_s: 60, timeMax_s: 300 },
      { currentMultiple: 2.0, timeMin_s: 10, timeMax_s: 60 },
      { currentMultiple: 4.0, timeMin_s: 1, timeMax_s: 10 },
      { currentMultiple: 8.0, timeMin_s: 0.04, timeMax_s: 0.4 },
      { currentMultiple: 12.0, timeMin_s: 0.01, timeMax_s: 0.04 },
    ],
    adjustable: {
      longDelay: '0.5~1.0 × In, 4~24s',
      shortDelay: '1.5~12 × In, 0.1~0.4s',
      instantaneous: '2~15 × In',
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Fuse 특성
// ═══════════════════════════════════════════════════════════════════════════════

export const FUSE_TCC: TCCDevice[] = [
  {
    id: 'FUSE-100A-gG',
    type: 'fuse',
    manufacturer: 'Generic',
    model: 'gG 100A (IEC 60269)',
    ratingA: 100,
    breakingCapacity_kA: 100,
    curve: [
      { currentMultiple: 1.25, timeMin_s: 3600, timeMax_s: 3600 },
      { currentMultiple: 1.6, timeMin_s: 60, timeMax_s: 180 },
      { currentMultiple: 2.0, timeMin_s: 10, timeMax_s: 40 },
      { currentMultiple: 3.0, timeMin_s: 1, timeMax_s: 5 },
      { currentMultiple: 5.0, timeMin_s: 0.1, timeMax_s: 0.5 },
      { currentMultiple: 10.0, timeMin_s: 0.01, timeMax_s: 0.05 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — OCR (과전류 계전기) 특성
// ═══════════════════════════════════════════════════════════════════════════════

export type OCRCurveType = 'NI' | 'VI' | 'EI' | 'LTI';

export interface OCRSetting {
  curveType: OCRCurveType;
  pickupA: number;
  tds: number; // Time Dial Setting
}

/** IEC 60255 표준 역한시 곡선 공식 계수 */
export const OCR_CURVE_CONSTANTS: Record<OCRCurveType, { a: number; b: number; p: number }> = {
  NI:  { a: 0.14,  b: 0.02, p: 1 },     // Normal Inverse
  VI:  { a: 13.5,  b: 1.0,  p: 1 },     // Very Inverse
  EI:  { a: 80.0,  b: 2.0,  p: 2 },     // Extremely Inverse
  LTI: { a: 120.0, b: 1.0,  p: 1 },     // Long Time Inverse
};

/**
 * OCR 동작 시간 계산 (IEC 60255).
 * t = TDS × (a / ((I/Ip)^p - b))
 */
export function calculateOCRTime(
  faultCurrent_A: number,
  setting: OCRSetting,
): number {
  const { a, b, p } = OCR_CURVE_CONSTANTS[setting.curveType];
  const ratio = faultCurrent_A / setting.pickupA;
  if (ratio <= 1) return Infinity;
  return setting.tds * (a / (Math.pow(ratio, p) - b));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — 보호 협조 검증
// ═══════════════════════════════════════════════════════════════════════════════

export interface CoordinationResult {
  upstream: string;
  downstream: string;
  faultCurrent_A: number;
  upstreamTime_s: number;
  downstreamTime_s: number;
  margin_s: number;
  selective: boolean;
  note: string;
}

/**
 * 2개 보호장치 간 선택성(selectivity) 검증.
 * 하위 장치가 상위보다 먼저 동작해야 선택성 확보.
 * 최소 마진: 0.3s (MCCB-MCCB), 0.15s (fuse-MCCB)
 */
export function checkSelectivity(
  upstream: TCCDevice,
  downstream: TCCDevice,
  faultCurrent_A: number,
): CoordinationResult {
  const ratio_up = faultCurrent_A / upstream.ratingA;
  const ratio_down = faultCurrent_A / downstream.ratingA;

  // 곡선에서 동작 시간 보간
  const upTime = interpolateTime(upstream.curve, ratio_up);
  const downTime = interpolateTime(downstream.curve, ratio_down);

  const minMargin = upstream.type === 'fuse' || downstream.type === 'fuse' ? 0.15 : 0.3;
  const margin = upTime - downTime;
  const selective = margin >= minMargin;

  return {
    upstream: `${upstream.model} (${upstream.ratingA}A)`,
    downstream: `${downstream.model} (${downstream.ratingA}A)`,
    faultCurrent_A,
    upstreamTime_s: Math.round(upTime * 1000) / 1000,
    downstreamTime_s: Math.round(downTime * 1000) / 1000,
    margin_s: Math.round(margin * 1000) / 1000,
    selective,
    note: selective
      ? `선택성 확보 (마진 ${margin.toFixed(3)}s ≥ ${minMargin}s)`
      : `선택성 미확보 — 상위/하위 동시 차단 위험 (마진 ${margin.toFixed(3)}s < ${minMargin}s)`,
  };
}

function interpolateTime(curve: TCCPoint[], multiple: number): number {
  if (multiple <= 0) return Infinity;
  if (curve.length === 0) return 0;

  // 범위 밖
  if (multiple <= curve[0].currentMultiple) return curve[0].timeMax_s;
  if (multiple >= curve[curve.length - 1].currentMultiple) return curve[curve.length - 1].timeMin_s;

  // 선형 보간 (log-log 스케일)
  for (let i = 1; i < curve.length; i++) {
    if (multiple <= curve[i].currentMultiple) {
      const x0 = Math.log10(curve[i - 1].currentMultiple);
      const x1 = Math.log10(curve[i].currentMultiple);
      const y0 = Math.log10(curve[i - 1].timeMax_s || 0.001);
      const y1 = Math.log10(curve[i].timeMax_s || 0.001);
      const x = Math.log10(multiple);
      const y = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      return Math.pow(10, y);
    }
  }
  return 0;
}

/** TCC 장치 수 */
export function getTCCDeviceCount(): number {
  return MCCB_TCC.length + ACB_TCC.length + FUSE_TCC.length;
}
