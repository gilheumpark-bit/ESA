/**
 * 기상청 일사량 API 연동 + PV 발전량 예측
 * ------------------------------------------
 * 기상자료개방포털(data.kma.go.kr) 공공 API 사용.
 * 일사량 → 예상 발전량 변환.
 *
 * PART 1: API client
 * PART 2: PV generation estimate
 * PART 3: Fallback (API 미연결 시 지역별 평균)
 */

import { log } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 기상청 API Client
// ═══════════════════════════════════════════════════════════════════════════════

const KMA_API_BASE = 'https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php';

export interface IrradianceData {
  date: string;           // YYYY-MM-DD
  location: string;
  /** 일일 수평면 전일사량 (MJ/m²) */
  globalIrradiance_MJ: number;
  /** 일조시간 (시간) */
  sunshineHours: number;
  /** 최고 기온 (°C) */
  maxTemp_C: number;
}

/**
 * 기상청 API에서 일사량 조회.
 * API 키 필요 (KMA_API_KEY 환경변수).
 */
export async function fetchIrradiance(
  stationId: string,
  date: string,
): Promise<IrradianceData | null> {
  const apiKey = process.env.KMA_API_KEY;
  if (!apiKey) {
    log.warn('solar', '기상청 API 키 미설정 — 지역 평균값 사용');
    return null;
  }

  try {
    const url = `${KMA_API_BASE}?tm=${date.replace(/-/g, '')}&stn=${stationId}&authKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const text = await res.text();
    // KMA CSV 파싱 (간략)
    const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim());
    if (lines.length < 2) return null;

    const fields = lines[1].split(/\s+/);
    return {
      date,
      location: stationId,
      globalIrradiance_MJ: parseFloat(fields[33]) || 0, // 전일사량
      sunshineHours: parseFloat(fields[31]) || 0,       // 일조시간
      maxTemp_C: parseFloat(fields[10]) || 25,           // 최고기온
    };
  } catch (err) {
    log.error('solar', '기상청 API 호출 실패', { error: String(err) });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — PV 발전량 예측
// ═══════════════════════════════════════════════════════════════════════════════

export interface PVEstimate {
  /** 일일 예상 발전량 (kWh) */
  dailyGeneration_kWh: number;
  /** 월간 예상 발전량 (kWh) */
  monthlyGeneration_kWh: number;
  /** 연간 예상 발전량 (kWh) */
  annualGeneration_kWh: number;
  /** 이용률 (%) */
  capacityFactor: number;
  /** 적용 일사량 (kWh/m²/day) */
  peakSunHours: number;
  /** 온도 손실 계수 */
  tempLossFactor: number;
  /** 데이터 출처 */
  source: 'kma-api' | 'regional-average';
}

/**
 * PV 발전량 예측.
 * @param capacityKW — PV 설치 용량 (kW)
 * @param irradiance — 일사량 (MJ/m² or kWh/m²/day)
 * @param panelTemp — 셀 온도 (°C, 기본 45°C)
 * @param systemLoss — 시스템 손실률 (기본 0.85 = 15% 손실)
 */
export function estimatePVGeneration(
  capacityKW: number,
  irradiance_kWh_m2_day: number,
  panelTemp_C: number = 45,
  systemLoss: number = 0.85,
): PVEstimate {
  // 온도 손실: 결정질 Si는 -0.4%/°C (STC 25°C 기준)
  const tempCoeff = -0.004;
  const tempLoss = 1 + tempCoeff * (panelTemp_C - 25);
  const tempLossFactor = Math.max(0.7, Math.min(1.0, tempLoss));

  // 일일 발전량 = 용량 × PSH × 시스템효율 × 온도보정
  const dailyGen = capacityKW * irradiance_kWh_m2_day * systemLoss * tempLossFactor;
  const monthlyGen = dailyGen * 30;
  const annualGen = dailyGen * 365;

  // 이용률 = 연간발전량 / (용량 × 8760시간)
  const capacityFactor = (annualGen / (capacityKW * 8760)) * 100;

  return {
    dailyGeneration_kWh: Math.round(dailyGen * 10) / 10,
    monthlyGeneration_kWh: Math.round(monthlyGen),
    annualGeneration_kWh: Math.round(annualGen),
    capacityFactor: Math.round(capacityFactor * 10) / 10,
    peakSunHours: irradiance_kWh_m2_day,
    tempLossFactor: Math.round(tempLossFactor * 1000) / 1000,
    source: 'regional-average',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 지역별 평균 일사량 (API 미연결 시 폴백)
// ═══════════════════════════════════════════════════════════════════════════════

/** 한국 주요 지역 월별 평균 일사량 (kWh/m²/day) — 기상청 30년 평균 */
export const REGIONAL_IRRADIANCE: Record<string, { name: string; monthly: number[] }> = {
  '108': { name: '서울', monthly: [2.6, 3.2, 3.8, 4.5, 5.0, 4.6, 3.7, 3.9, 3.9, 3.5, 2.7, 2.3] },
  '159': { name: '부산', monthly: [3.0, 3.5, 4.0, 4.7, 5.1, 4.4, 3.8, 4.2, 3.9, 3.7, 3.0, 2.7] },
  '143': { name: '대구', monthly: [2.8, 3.4, 4.0, 4.8, 5.2, 4.7, 3.6, 4.0, 3.8, 3.6, 2.8, 2.5] },
  '156': { name: '광주', monthly: [2.7, 3.3, 3.9, 4.6, 5.0, 4.3, 3.5, 4.0, 3.8, 3.5, 2.7, 2.4] },
  '133': { name: '대전', monthly: [2.7, 3.3, 3.9, 4.6, 5.1, 4.5, 3.6, 4.0, 3.8, 3.5, 2.7, 2.4] },
  '184': { name: '제주', monthly: [2.5, 3.0, 3.6, 4.3, 4.8, 4.2, 4.0, 4.5, 3.7, 3.3, 2.5, 2.2] },
  '105': { name: '강릉', monthly: [2.8, 3.3, 3.9, 4.6, 5.0, 4.5, 3.5, 3.8, 3.7, 3.4, 2.8, 2.5] },
  '146': { name: '전주', monthly: [2.7, 3.2, 3.8, 4.5, 5.0, 4.4, 3.5, 3.9, 3.7, 3.4, 2.6, 2.3] },
};

/** 지역 코드로 월별 일사량 조회 */
export function getRegionalIrradiance(stationId: string, month: number): number {
  const region = REGIONAL_IRRADIANCE[stationId];
  if (!region || month < 1 || month > 12) {
    // 기본: 전국 평균 약 3.6 kWh/m²/day
    return 3.6;
  }
  return region.monthly[month - 1];
}

/** 전국 연평균 일사량 */
export function getNationalAverageIrradiance(): number {
  const allMonths = Object.values(REGIONAL_IRRADIANCE).flatMap(r => r.monthly);
  return Math.round((allMonths.reduce((a, b) => a + b, 0) / allMonths.length) * 10) / 10;
}
