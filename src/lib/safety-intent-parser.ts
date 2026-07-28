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
  // **`조(槽)` 는 사문이었다.** 괄호가 캡처 그룹이라 이 대안은 `조槽` **두 글자
  // 연속**일 때만 맞는다 — `조` 도 `槽` 도 단독으로는 안 걸린다. 그래서
  // `정화조`·`침전조`·`오수처리조` 가 전부 빠졌고, 화면은 "실내 작업 환경"에
  // 전기 항목 4개만 띄웠다(2026-07-28 독립 공격자 좌석 → 실행 재현:
  // `'정화조 내부 점검, 2명'` → 밀폐공간 아님 · cs 항목 **0**, `맨홀` 은 11).
  //
  // **국내 질식 사망의 대표 장소가 정화조·오수처리시설이다.** 맨홀만 아는
  // 파서는 가장 많이 죽는 자리를 못 본다.
  //
  // `~조` 를 통째로 잡으면 `배전반 구조`·`계약 조건` 같은 말에 오발화하므로
  // 실제 조(槽) 이름을 열거한다. `집수정`·`정화조` 처럼 `조` 로 끝나지 않는
  // 것도 있어 별도로 적는다.
  {
    pattern: /탱크|tank|수조|오수조|정화조|침전조|저수조|물탱크|약품조|폭기조|소화조|집수조|오수처리|정화시설/i,
    subtype: 'tank',
    ko: '탱크/조',
  },
  { pattern: /터널|tunnel/i,              subtype: 'tunnel',           ko: '터널' },
  { pattern: /집수정|맨홀정|밸브실|계량기실/i, subtype: 'pit',           ko: '집수정/지하 실' },
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
  // `폭우`·`소나기`·`장마`·`침수` 가 빠져 있었다 — 실행 재현:
  // `'폭우 속 옥외 배전반 작업 2명'` → 우천 항목 **0**(`우천` 이라 써야만 4개).
  // 방수 콘센트·15mA 누전차단기·절연장갑·절연저항이 통째로 사라진다.
  // 게다가 파서가 못 읽은 조건은 공백 고지(`gap-01`) 대상도 아니라 **아무
  // 말도 안 나온다**(2026-07-28 독립 공격자 좌석).
  { pattern: /비\s*옴|우천|강우|빗속|비\s*오|빗|폭우|호우|소나기|장마|물\s*고|침수|젖은\s*바닥/i, condition: 'rain', ko: '비/우천' },
  { pattern: /눈\s*옴|강설|눈\s*오|적설|폭설|대설|결빙|빙판/i,  condition: 'snow',         ko: '눈' },
  { pattern: /강풍|돌풍|바람\s*강|태풍|풍속/i,               condition: 'wind',         ko: '강풍' },
  // 온도 표기는 아래 `matchesHeatTemperature` 가 따로 본다 — 숫자 비교가 필요해서다.
  { pattern: /폭염|폭서|더위|혹서/i,                         condition: 'extreme_heat', ko: '폭염' },
  { pattern: /안개|짙은\s*안개/i,                            condition: 'fog',          ko: '안개' },
  { pattern: /낙뢰|천둥|번개|뇌우/i,                         condition: 'thunder',      ko: '낙뢰/뇌우' },
  { pattern: /맑음|청명|쾌청|sunny/i,                        condition: 'clear',        ko: '맑음' },
];

/** 폭염작업 기준 — 체감온도(°C). 체크리스트 문구와 같은 값이어야 한다. */
const HEAT_THRESHOLD_C = 31;

/**
 * 온도 표기로 폭염을 판정한다.
 *
 * **앞서 이 자리는 `35도|36도|…|40도` 라는 문자열 나열이었다.** 둘이 틀렸다:
 * ① 기준이 35 였다 — 현행 기준은 **체감온도 31°C** 이고 체크리스트 문구는
 * 이미 31 로 고쳤는데 파서가 35 에 머물러 **31~34°C 구간에서 폭염 항목이
 * 한 건도 안 나왔다**(2026-07-28 독립 심사 도메인 좌석 실행 실측:
 * "체감온도 32도" → NOMATCH). 화면에 도달하지 못하는 수리였다.
 * ② 나열이라 41도 이상이 빠졌다 — 더 더운데 안 잡히는 쪽이 위험하다.
 *
 * 숫자를 읽어 비교한다. 기준 미만의 온도 언급은 폭염이 아니다 —
 * "기온 20도" 를 폭염으로 읽으면 항목이 상시 떠서 사용자가 무시하게 된다.
 */
function matchesHeatTemperature(text: string): boolean {
  // 앞 판은 `(\d{1,2}(?:\.\d)?)\s*(?:도|°C|℃)` 였고 셋이 틀렸다
  // (2026-07-28 독립 공격자 좌석 → 실행 재현):
  //
  //  ① `영하 40도` → **폭염 발화.** 부호를 안 봐서 한파에 "그늘막·얼음팩"
  //     안내가 떴다. 가장 나쁜 방향의 오발화다.
  //  ② `체감온도 100도` → **폭염 아님.** `\d{1,2}` 가 "00" 만 잡아 0 으로
  //     읽었다. 99 도 초과가 전부 안전으로 판정됐다.
  //  ③ `케이블 35도 각도로 포설` · `습도 35도` → **폭염 발화.** 온도가
  //     아닌 "도" 를 온도로 읽었다.
  //
  // 자릿수 제한을 풀고, 앞의 부호·문맥과 뒤의 단위 낱말을 함께 본다.
  const re = /(영하\s*|-\s*|마이너스\s*)?(\d{1,3}(?:\.\d)?)\s*(?:도|°\s*C|℃)/gi;
  for (const m of text.matchAll(re)) {
    if (m[1]) continue; // 영하는 폭염이 아니다
    const at = m.index ?? 0;
    // "도" 가 온도가 아닌 문맥 — 각도·습도·회전 등.
    const before = text.slice(Math.max(0, at - 12), at);
    const after = text.slice(at + m[0].length, at + m[0].length + 6);
    if (/각도|방향|회전|경사|위상|습도|각\s*$/.test(before)) continue;
    if (/^\s*(각도|방향|회전|경사)/.test(after)) continue;
    if (Number.parseFloat(m[2]) >= HEAT_THRESHOLD_C) return true;
  }
  return false;
}

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
  // 온도 표기 경로 — 키워드로 이미 잡혔으면 중복해 넣지 않는다.
  if (matchesHeatTemperature(text) && !result.some((w) => w.condition === 'extreme_heat')) {
    result.push({ condition: 'extreme_heat', ko: '폭염' });
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
  let duration = (endH + endM / 60) - (startH + startM / 60);

  // **자정을 넘기는 작업.** 앞 판은 `Math.max(0, duration)` 으로 음수를 0 으로
  // 뭉갰다. 그러면 `22시~06시` 가 0 시간이 되고, 스케줄러의 2 시간 주기 루프가
  // 첫 바퀴에 끝나 **법정 가스 재측정이 통째로 사라진다** — 실행 재현:
  // 야간 가스측정 1 건, 주간(09~18) 5 건(2026-07-28 독립 공격자 좌석).
  // 154kV 수전설비 정전작업은 야간이 표준이다.
  if (duration < 0) duration += 24;

  return { start: startStr, end: endStr, durationHours: duration };
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
