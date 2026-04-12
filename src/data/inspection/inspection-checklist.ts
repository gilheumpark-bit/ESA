/**
 * 법정 정기점검 체크리스트
 * --------------------------
 * 전기안전관리법 시행규칙 별표 기반.
 * 전기안전관리자가 월간/연간 점검 시 사용.
 * 법령 = 저작권 자유 (저작권법 제7조).
 *
 * PART 1: 점검 항목
 * PART 2: 점검 일정
 * PART 3: 체크리스트 생성
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface InspectionItem {
  id: string;
  category: string;
  item: string;
  method: string;
  criteria: string;
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  legalBasis: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface ChecklistEntry {
  item: InspectionItem;
  status: 'pass' | 'fail' | 'na' | 'pending';
  value?: string;
  note?: string;
  inspectedAt?: string;
  inspector?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 점검 항목
// ═══════════════════════════════════════════════════════════════════════════════

export const INSPECTION_ITEMS: InspectionItem[] = [
  // 수변전 설비
  { id: 'INS-001', category: '수변전', item: '변압기 절연유 온도', method: '온도계 확인', criteria: '≤95°C (최고 유온)', frequency: 'monthly', legalBasis: '전기안전관리법 시행규칙 별표13', severity: 'critical' },
  { id: 'INS-002', category: '수변전', item: '변압기 이상음/진동', method: '청취/촉진', criteria: '이상음 없음', frequency: 'monthly', legalBasis: '전기안전관리법 시행규칙 별표13', severity: 'major' },
  { id: 'INS-003', category: '수변전', item: '변압기 유면/유량', method: '유면계 확인', criteria: '정상 범위', frequency: 'monthly', legalBasis: '전기안전관리법 시행규칙 별표13', severity: 'major' },
  { id: 'INS-004', category: '수변전', item: '차단기 개폐 상태', method: '육안 확인', criteria: '표시 정상', frequency: 'monthly', legalBasis: '전기안전관리법 시행규칙 별표13', severity: 'critical' },
  { id: 'INS-005', category: '수변전', item: '차단기 동작 회수', method: '카운터 확인', criteria: '정격 이내', frequency: 'quarterly', legalBasis: '전기안전관리법 시행규칙 별표13', severity: 'major' },
  { id: 'INS-006', category: '수변전', item: '보호 계전기 정정값', method: '정정표 대조', criteria: '설정값 일치', frequency: 'annual', legalBasis: '전기안전관리법 시행규칙 별표13', severity: 'critical' },

  // 접지
  { id: 'INS-010', category: '접지', item: '접지 저항 측정', method: '접지저항계', criteria: 'KEC 142.3~5 기준 이하', frequency: 'annual', legalBasis: 'KEC 142.3', severity: 'critical' },
  { id: 'INS-011', category: '접지', item: '접지선 연결 상태', method: '육안/토크렌치', criteria: '단선/풀림 없음', frequency: 'semi-annual', legalBasis: 'KEC 142.2', severity: 'critical' },
  { id: 'INS-012', category: '접지', item: '등전위 본딩', method: '연속성 시험', criteria: '0.1Ω 이하', frequency: 'annual', legalBasis: 'KEC 142.4', severity: 'major' },

  // 배전반/분전반
  { id: 'INS-020', category: '배전반', item: '배전반 내부 청소', method: '육안/청소', criteria: '먼지/이물 없음', frequency: 'semi-annual', legalBasis: '전기안전관리법 시행규칙', severity: 'minor' },
  { id: 'INS-021', category: '배전반', item: '차단기 열화 상태', method: '적외선 열화상', criteria: '이상 온도 없음 (ΔT ≤ 10K)', frequency: 'annual', legalBasis: '전기안전관리법 시행규칙', severity: 'critical' },
  { id: 'INS-022', category: '배전반', item: '모선 접속부 볼트', method: '토크렌치', criteria: '정격 토크', frequency: 'annual', legalBasis: '전기안전관리법 시행규칙', severity: 'major' },
  { id: 'INS-023', category: '배전반', item: '누전차단기 테스트', method: '테스트 버튼', criteria: '동작 정상', frequency: 'monthly', legalBasis: 'KEC 212.4', severity: 'critical' },

  // 절연
  { id: 'INS-030', category: '절연', item: '절연 저항 측정', method: '메가(절연저항계)', criteria: '≥1MΩ (저압)', frequency: 'annual', legalBasis: 'KEC 612.3 / IEC 612.3', severity: 'critical' },
  { id: 'INS-031', category: '절연', item: '전선 피복 상태', method: '육안', criteria: '균열/변색 없음', frequency: 'semi-annual', legalBasis: '전기안전관리법', severity: 'major' },

  // 비상 전원
  { id: 'INS-040', category: '비상전원', item: '비상 발전기 시운전', method: '무부하/부하 운전', criteria: '기동 10초 이내, 전압/주파수 정상', frequency: 'monthly', legalBasis: '소방시설법', severity: 'critical' },
  { id: 'INS-041', category: '비상전원', item: 'UPS 배터리 상태', method: '배터리 시험기', criteria: '용량 80% 이상', frequency: 'quarterly', legalBasis: '전기안전관리법', severity: 'major' },
  { id: 'INS-042', category: '비상전원', item: 'ATS 절환 시험', method: '절환 동작', criteria: '자동 절환 정상', frequency: 'quarterly', legalBasis: '소방시설법', severity: 'critical' },

  // 조명/안전
  { id: 'INS-050', category: '조명', item: '비상등/유도등 점등', method: '육안/정전 시험', criteria: '전등 점등, 90분 유지', frequency: 'monthly', legalBasis: '소방시설법 시행령', severity: 'critical' },
  { id: 'INS-051', category: '조명', item: '조도 측정', method: '조도계', criteria: 'KS A 3011 기준 이상', frequency: 'annual', legalBasis: 'KEC 234.1', severity: 'minor' },

  // 태양광/ESS
  { id: 'INS-060', category: '신재생', item: 'PV 모듈 절연 저항', method: '메가', criteria: '≥1MΩ', frequency: 'annual', legalBasis: 'KEC 501.1', severity: 'critical' },
  { id: 'INS-061', category: '신재생', item: 'ESS BMS 상태', method: '모니터링 확인', criteria: 'SOC/SOH 정상', frequency: 'monthly', legalBasis: 'KEC 520.1', severity: 'critical' },
  { id: 'INS-062', category: '신재생', item: '인버터 동작 상태', method: '모니터링', criteria: '출력/효율 정상', frequency: 'monthly', legalBasis: 'KEC 501.3', severity: 'major' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 점검 일정
// ═══════════════════════════════════════════════════════════════════════════════

export interface InspectionSchedule {
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  label: string;
  months: number[];
}

export const INSPECTION_SCHEDULES: InspectionSchedule[] = [
  { frequency: 'monthly', label: '월간 점검', months: [1,2,3,4,5,6,7,8,9,10,11,12] },
  { frequency: 'quarterly', label: '분기 점검', months: [3,6,9,12] },
  { frequency: 'semi-annual', label: '반기 점검', months: [6,12] },
  { frequency: 'annual', label: '연간 정밀 점검', months: [12] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 체크리스트 생성
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 특정 월의 점검 항목 생성.
 */
export function generateChecklist(month: number): ChecklistEntry[] {
  const applicableFreqs = INSPECTION_SCHEDULES
    .filter(s => s.months.includes(month))
    .map(s => s.frequency);

  return INSPECTION_ITEMS
    .filter(item => applicableFreqs.includes(item.frequency))
    .map(item => ({
      item,
      status: 'pending' as const,
    }));
}

/**
 * 카테고리별 점검 항목 수.
 */
export function getInspectionStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const item of INSPECTION_ITEMS) {
    stats[item.category] = (stats[item.category] ?? 0) + 1;
  }
  return stats;
}

/** 전체 항목 수 */
export function getInspectionItemCount(): number {
  return INSPECTION_ITEMS.length;
}
