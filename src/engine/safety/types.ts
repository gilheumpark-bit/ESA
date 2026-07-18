/**
 * ESVA 현장 안전관리 — 공유 타입 정의
 *
 * PART 1: 위치/날씨/작업 분류
 * PART 2: 파서 결과 타입
 * PART 3: 안전 분석 결과 타입
 * PART 4: 스케줄러 타입
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 분류 열거형
// ═══════════════════════════════════════════════════════════════════════════════

/** 작업 장소 유형 */
export type LocationType =
  | 'confined_space'   // 밀폐공간 (산안법 제618조 대상)
  | 'indoor'           // 실내 (전기실, 수변전실)
  | 'outdoor'          // 옥외
  | 'underground'      // 지하 (밀폐 아닌 지하실/지하층)
  | 'rooftop'          // 옥상
  | 'elevated'         // 고소 (전주, 철탑, 고가)

/** 밀폐공간 세부 유형 */
export type ConfinedSpaceSubtype =
  | 'underground_duct'  // 지하 공동구
  | 'manhole'           // 맨홀
  | 'pit'               // 피트
  | 'tank'              // 탱크, 조
  | 'tunnel'            // 터널
  | 'vault'             // 지하 변전실

/** 기상 조건 */
export type WeatherCondition =
  | 'clear'        // 맑음
  | 'rain'         // 비, 우천
  | 'snow'         // 눈
  | 'wind'         // 강풍
  | 'extreme_heat' // 폭염
  | 'fog'          // 안개
  | 'thunder'      // 낙뢰

/** 전기 작업 유형 */
export type WorkType =
  | 'cable_pulling'      // 입선, 케이블 포설
  | 'termination'        // 접속, 결선
  | 'panel_work'         // 배전반, 분전반
  | 'transformer_work'   // 변압기
  | 'grounding'          // 접지
  | 'lighting'           // 조명
  | 'live_work'          // 활선 작업 (충전부 접근)
  | 'conduit'            // 전선관
  | 'measurement'        // 측정, 절연저항, 검사
  | 'inspection'         // 점검

/** 위험도 등급 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 파서 결과 타입
// ═══════════════════════════════════════════════════════════════════════════════

export interface LocationInfo {
  type: LocationType;
  subtype?: ConfinedSpaceSubtype;
  ko: string;                  // 원문 텍스트 (예: "지하 공동구")
  isHazardous: boolean;        // 위험 장소 여부
}

export interface WeatherInfo {
  condition: WeatherCondition;
  ko: string;
}

export interface WorkTypeInfo {
  type: WorkType;
  ko: string;
  isLiveWork: boolean;         // 활선 여부
}

export interface WorkHours {
  start: string;               // "09:00"
  end: string;                 // "18:00"
  durationHours: number;
}

/** 자연어 파싱 결과 */
export interface SafetyIntentResult {
  raw: string;
  location: LocationInfo | null;
  weather: WeatherInfo[];
  workers: number | null;
  supervisors: number | null;
  workTypes: WorkTypeInfo[];
  hours: WorkHours | null;
  confidence: number;
  isConfinedSpace: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 안전 분석 결과 타입
// ═══════════════════════════════════════════════════════════════════════════════

export interface SafetyCheckItem {
  id: string;
  category: string;        // '산소/가스', '환기', '보호구', '연락체계', etc.
  title: string;
  description: string;
  regulation: string;      // "산안법 제618조", "KEC 232조" 등
  riskLevel: RiskLevel;
  isMissing: boolean;
  alternative?: string;    // 현장에서 즉시 할 수 있는 대안 (ESA 톤)
}

export interface SafetyAnalysisResult {
  intent: SafetyIntentResult;
  overallRisk: RiskLevel;
  checkItems: SafetyCheckItem[];
  missingCritical: SafetyCheckItem[];    // riskLevel: 'critical' && isMissing
  missingRecommended: SafetyCheckItem[]; // riskLevel: 'high'/'medium' && isMissing
  summaryKo: string;
  applicableRegulations: string[];
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — 스케줄러 타입
// ═══════════════════════════════════════════════════════════════════════════════

export interface CheckpointItem {
  time: string;            // "09:00", "11:00"
  title: string;
  description: string;
  regulation: string;
  isGasMeasurement: boolean;
  isMandatory: boolean;
}

export interface SafetySchedule {
  workStart: string;
  workEnd: string;
  checkpoints: CheckpointItem[];
  deadManIntervalMinutes: number;  // 데드맨 스위치 체크 주기
  totalCheckpoints: number;
}

/** 데드맨 스위치 단계 */
export type DeadManStage = 'idle' | 'active' | 'warn1' | 'warn2' | 'sos'

export interface DeadManState {
  stage: DeadManStage;
  lastAckAt: number;       // timestamp ms
  intervalMs: number;
  supervisorPhones: string[];
}
