/**
 * ESVA 현장 안전 파서
 *
 * 자연어 입력 → 구조화된 현장 안전 변수 추출 (LLM 불필요, 순수 Regex)
 * 입력 예: "지하 공동구, 비 옴, 4명, 입선 작업, 09시~18시, 관리자 3명"
 *
 * PART 1: 패턴 정의
 * PART 2: 내부 추출 함수
 * PART 3: 공개 파서 함수
 */

import type {
  SafetyIntentResult,
  LocationInfo,
  LocationType,
  ConfinedSpaceSubtype,
  WeatherInfo,
  WeatherCondition,
  WorkTypeInfo,
  WorkType,
  WorkHours,
} from '@/engine/safety/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 패턴 정의
// ═══════════════════════════════════════════════════════════════════════════════

/** 밀폐공간 위치 패턴 (산안법 제618조 대상) */
const CONFINED_SPACE_PATTERNS: Array<{
  pattern: RegExp;
  subtype: ConfinedSpaceSubtype;
  ko: string;
}> = [
  { pattern: /공동구|공동덕트/i,           subtype: 'underground_duct', ko: '지하 공동구' },
  { pattern: /맨홀|맨 홀/i,               subtype: 'manhole',          ko: '맨홀' },
  { pattern: /피트|pit/i,                  subtype: 'pit',              ko: '피트' },
  { pattern: /탱크|조(槽)|수조|오수조/i,   subtype: 'tank',             ko: '탱크/조' },
  { pattern: /터널|tunnel/i,              subtype: 'tunnel',           ko: '터널' },
  { pattern: /지하\s*변전실|지하\s*전기실/, subtype: 'vault',            ko: '지하 변전실' },
];

/** 일반 위치 패턴 */
const LOCATION_PATTERNS: Array<{
  pattern: RegExp;
  type: LocationType;
  ko: string;
  isHazardous: boolean;
}> = [
  { pattern: /전기실|수변전실|변전실|MCC실/i, type: 'indoor',      ko: '전기실/수변전실', isHazardous: true },
  { pattern: /배전반실|분전반실/i,            type: 'indoor',      ko: '배전반실',        isHazardous: true },
  { pattern: /옥상|루프탑/i,                 type: 'rooftop',     ko: '옥상',            isHazardous: false },
  { pattern: /전주|철탑|고소|고가/i,          type: 'elevated',    ko: '고소 작업',       isHazardous: true },
  { pattern: /지하\s*\d+층|지하층|지하실/i,   type: 'underground', ko: '지하층',          isHazardous: false },
  { pattern: /옥외|야외|외부|지상/i,          type: 'outdoor',     ko: '옥외',            isHazardous: false },
  { pattern: /실내|내부/i,                   type: 'indoor',      ko: '실내',            isHazardous: false },
];

/** 기상 조건 패턴 */
const WEATHER_PATTERNS: Array<{
  pattern: RegExp;
  condition: WeatherCondition;
  ko: string;
}> = [
  { pattern: /비\s*옴|우천|강우|빗속|비\s*오|빗|빗/i,        condition: 'rain',         ko: '비/우천' },
  { pattern: /눈\s*옴|강설|눈\s*오|적설/i,                   condition: 'snow',         ko: '눈' },
  { pattern: /강풍|돌풍|바람\s*강|태풍/i,                    condition: 'wind',         ko: '강풍' },
  { pattern: /폭염|폭서|더위|혹서|35도|36도|37도|38도|39도|40도/i, condition: 'extreme_heat', ko: '폭염' },
  { pattern: /안개|짙은\s*안개/i,                            condition: 'fog',          ko: '안개' },
  { pattern: /낙뢰|천둥|번개|뇌우/i,                         condition: 'thunder',      ko: '낙뢰/뇌우' },
  { pattern: /맑음|청명|쾌청|sunny/i,                        condition: 'clear',        ko: '맑음' },
];

/** 작업 유형 패턴 */
const WORK_TYPE_PATTERNS: Array<{
  pattern: RegExp;
  type: WorkType;
  ko: string;
  isLiveWork: boolean;
}> = [
  { pattern: /입선|케이블\s*포설|케이블\s*부설|전선\s*포설|Cable\s*pulling/i,   type: 'cable_pulling',    ko: '입선/케이블 포설', isLiveWork: false },
  { pattern: /접속|결선|단말|터미네이션/i,                                      type: 'termination',      ko: '접속/결선 작업',   isLiveWork: false },
  { pattern: /배전반|분전반|패널\s*작업|MCC\s*작업/i,                           type: 'panel_work',       ko: '배전반/분전반',    isLiveWork: false },
  { pattern: /변압기\s*작업|TR\s*교체|변압기\s*교체/i,                          type: 'transformer_work', ko: '변압기 작업',      isLiveWork: false },
  { pattern: /접지\s*작업|접지봉|어스/i,                                        type: 'grounding',        ko: '접지 작업',        isLiveWork: false },
  { pattern: /조명\s*작업|등기구|LED\s*교체/i,                                  type: 'lighting',         ko: '조명 작업',        isLiveWork: false },
  { pattern: /활선|충전부\s*접근|무정전|Hot\s*work/i,                           type: 'live_work',        ko: '활선 작업',        isLiveWork: true },
  { pattern: /전선관|몰드|덕트\s*공사|레이스웨이/i,                             type: 'conduit',          ko: '전선관 공사',      isLiveWork: false },
  { pattern: /절연저항|메가\s*측정|접지저항\s*측정|절연\s*측정|IR\s*측정/i,     type: 'measurement',      ko: '절연저항 측정',    isLiveWork: false },
  { pattern: /점검|검사|순시|정기\s*검사|예방\s*점검/i,                         type: 'inspection',       ko: '점검/검사',        isLiveWork: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 내부 추출 함수
// ═══════════════════════════════════════════════════════════════════════════════

/** 위치 정보 추출 */
function extractLocation(text: string): LocationInfo | null {
  // 먼저 밀폐공간 체크 (더 구체적이므로 우선순위 높음)
  for (const entry of CONFINED_SPACE_PATTERNS) {
    if (entry.pattern.test(text)) {
      return {
        type: 'confined_space',
        subtype: entry.subtype,
        ko: entry.ko,
        isHazardous: true,
      };
    }
  }

  // 일반 위치 패턴
  for (const entry of LOCATION_PATTERNS) {
    if (entry.pattern.test(text)) {
      return {
        type: entry.type,
        ko: entry.ko,
        isHazardous: entry.isHazardous,
      };
    }
  }

  return null;
}

/** 기상 조건 추출 (복수 가능) */
function extractWeather(text: string): WeatherInfo[] {
  const result: WeatherInfo[] = [];
  for (const entry of WEATHER_PATTERNS) {
    if (entry.pattern.test(text)) {
      result.push({ condition: entry.condition, ko: entry.ko });
    }
  }
  return result;
}

/** 작업자 수 추출 */
function extractWorkers(text: string): number | null {
  // "4명" 또는 "4 명" 패턴, 앞에 "관리자", "감리" 등이 없는 경우
  const match = text.match(/(?<!관리자\s*)(?<!감리\s*)(?<!감시\s*)(\d+)\s*명/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n > 0 && n < 1000) return n;
  }
  return null;
}

/** 관리자/감시자 수 추출 */
function extractSupervisors(text: string): number | null {
  const match = text.match(/관리자\s*(\d+)\s*명|감리\s*(\d+)\s*명|감시인\s*(\d+)\s*명|담당자\s*(\d+)\s*명/);
  if (match) {
    const n = parseInt(match[1] ?? match[2] ?? match[3] ?? match[4], 10);
    if (n > 0 && n < 100) return n;
  }
  return null;
}

/** 작업 유형 추출 (복수 가능) */
function extractWorkTypes(text: string): WorkTypeInfo[] {
  const result: WorkTypeInfo[] = [];
  for (const entry of WORK_TYPE_PATTERNS) {
    if (entry.pattern.test(text)) {
      result.push({ type: entry.type, ko: entry.ko, isLiveWork: entry.isLiveWork });
    }
  }
  return result;
}

/** 작업 시간 추출 */
function extractHours(text: string): WorkHours | null {
  // "09시~18시" 또는 "9시~18시" 또는 "09:00~18:00"
  const patternKr = /(\d{1,2})\s*시\s*[~\-~]\s*(\d{1,2})\s*시/;
  const patternClock = /(\d{2}):(\d{2})\s*[~\-~]\s*(\d{2}):(\d{2})/;

  let startH: number, endH: number, startM = 0, endM = 0;

  const mKr = text.match(patternKr);
  if (mKr) {
    startH = parseInt(mKr[1], 10);
    endH = parseInt(mKr[2], 10);
  } else {
    const mClock = text.match(patternClock);
    if (!mClock) return null;
    startH = parseInt(mClock[1], 10);
    startM = parseInt(mClock[2], 10);
    endH = parseInt(mClock[3], 10);
    endM = parseInt(mClock[4], 10);
  }

  if (startH < 0 || startH > 23 || endH < 0 || endH > 23) return null;

  const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
  const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const duration = (endH + endM / 60) - (startH + startM / 60);

  return { start: startStr, end: endStr, durationHours: Math.max(0, duration) };
}

/** 파싱 신뢰도 계산 */
function calcConfidence(result: Omit<SafetyIntentResult, 'confidence' | 'isConfinedSpace'>): number {
  let score = 0;
  if (result.location) score += 0.3;
  if (result.weather.length > 0) score += 0.15;
  if (result.workers !== null) score += 0.2;
  if (result.workTypes.length > 0) score += 0.2;
  if (result.hours) score += 0.15;
  return Math.min(1, score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 공개 파서 함수
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 자연어 현장 안전 입력 파싱
 * @example
 * parseSafetyIntent("지하 공동구, 비 옴, 4명, 입선 작업, 09시~18시, 관리자 3명")
 */
export function parseSafetyIntent(raw: string): SafetyIntentResult {
  const text = raw.trim();

  const location = extractLocation(text);
  const weather = extractWeather(text);
  const workers = extractWorkers(text);
  const supervisors = extractSupervisors(text);
  const workTypes = extractWorkTypes(text);
  const hours = extractHours(text);

  const isConfinedSpace = location?.type === 'confined_space';

  const partial = { raw: text, location, weather, workers, supervisors, workTypes, hours };
  const confidence = calcConfidence(partial);

  return { ...partial, confidence, isConfinedSpace };
}

/** 빈 결과 반환 (폼 직접 입력 시) */
export function emptySafetyIntent(): SafetyIntentResult {
  return {
    raw: '',
    location: null,
    weather: [],
    workers: null,
    supervisors: null,
    workTypes: [],
    hours: null,
    confidence: 0,
    isConfinedSpace: false,
  };
}
