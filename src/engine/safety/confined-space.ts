/**
 * ESVA 현장 안전 룰 엔진
 *
 * 파서 결과 → 산안법/KEC 기반 누락 항목 감지 + 현장 대안 제시
 * 순수 함수 — 부작용 없음, LLM 미사용
 *
 * 근거 법령:
 *   - 산업안전보건기준에 관한 규칙 제618조~628조 (밀폐공간)
 *   - KEC 한국전기설비규정 제232조 (특수 장소 배선)
 *   - KOSHA Guide E-173 (밀폐공간 전기 안전)
 *
 * PART 1: 체크 항목 정의
 * PART 2: 조건부 항목 생성 함수
 * PART 3: 공개 분석 함수
 */

import type {
  SafetyIntentResult,
  SafetyCheckItem,
  SafetyAnalysisResult,
  RiskLevel,
} from '@/engine/safety/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 체크 항목 정의
// ═══════════════════════════════════════════════════════════════════════════════

/** 밀폐공간 필수 체크 항목 기본 목록 */
const CONFINED_SPACE_MANDATORY: Omit<SafetyCheckItem, 'isMissing'>[] = [
  {
    id: 'cs-01',
    category: '산소/가스 측정',
    title: '산소 농도 측정',
    description: '작업 전 산소 농도 18% 이상 23.5% 미만 확인. 이탈 시 즉시 대피.',
    regulation: '산안법 제619조, 고용노동부 고시 제2020-44호',
    riskLevel: 'critical',
    alternative: '지하 공동구 진입 전 산소농도계(O2 감지기) 반드시 휴대. 없으면 작업 불가.',
  },
  {
    id: 'cs-02',
    category: '산소/가스 측정',
    title: '유해 가스 측정 (H₂S, CO, CH₄)',
    description: '황화수소 10ppm 이하, 일산화탄소 30ppm 이하, 메탄 10%LEL 이하 확인.',
    regulation: '산안법 제619조, 고용노동부 고시 제2020-44호',
    riskLevel: 'critical',
    alternative: '복합 가스 측정기(4in1) 없으면 작업 금지. 2시간마다 재측정 필수.',
  },
  {
    id: 'cs-03',
    category: '환기',
    title: '작업 전 충분한 환기',
    description: '자연환기 불충분 시 기계환기(송풍기) 실시. 환기 후 재측정 필수.',
    regulation: '산안법 제620조',
    riskLevel: 'critical',
    alternative: '덕트 팬 없으면 이동식 환풍기(최소 250CFM 이상) 즉시 배치.',
  },
  {
    id: 'cs-04',
    category: '감시인',
    title: '밀폐공간 외부 감시인 배치',
    description: '작업 중 외부에 감시인 1명 이상 상시 배치. 무선연락 유지.',
    regulation: '산안법 제623조',
    riskLevel: 'critical',
    alternative: '관리자 중 1명이 반드시 외부 대기. 무전기 또는 휴대폰 지참.',
  },
  {
    id: 'cs-05',
    category: '비상구조 장비',
    title: '구명 로프 및 구조 장비 비치',
    description: '추락/쓰러짐 대비 구명로프(안전블록), 공기호흡기 현장 비치.',
    regulation: '산안법 제623조',
    riskLevel: 'critical',
    alternative: '안전블록(셀프 리트랙팅 라이프라인) 또는 구명줄 최소 1세트 현장 준비.',
  },
  {
    id: 'cs-06',
    category: '작업 허가',
    title: '밀폐공간 작업 허가서 발급',
    description: '작업 전 밀폐공간 작업허가서(PTW) 발급 및 관리자 서명.',
    regulation: '산안법 제624조, 산안법 시행규칙 별지 제30호',
    riskLevel: 'high',
    alternative: 'ESVA 앱에서 디지털 작업허가서 즉시 생성 → 서명 요청 발송.',
  },
  {
    id: 'cs-07',
    category: '보호구',
    title: '송기마스크 또는 공기호흡기',
    description: '산소결핍/유해가스 환경에서 방독마스크 사용 금지. 반드시 송기마스크 착용.',
    regulation: '산안법 제619조',
    riskLevel: 'critical',
    alternative: '방독마스크는 부적합. 공기호흡기(SCBA) 또는 에어라인 방식 사용.',
  },
  {
    id: 'cs-08',
    category: '연락 체계',
    title: '비상연락 체계 구축',
    description: '119, 관리자, 작업 현장 간 연락 체계 사전 수립 및 공유.',
    regulation: '산안법 제625조',
    riskLevel: 'high',
    alternative: 'ESVA 앱 비상연락 버튼으로 관리자 전원에게 즉시 SOS 발송.',
  },
];

/** 우천 시 추가 체크 항목 */
const RAIN_CHECK_ITEMS: Omit<SafetyCheckItem, 'isMissing'>[] = [
  {
    id: 'rain-01',
    category: '우천 전기 안전',
    title: '방수형 콘센트/배선기구 사용',
    description: '우천 시 옥외 및 지하 습기 환경에서 방수(IP44 이상) 콘센트 필수.',
    regulation: 'KEC 232조 (특수 장소 배선)',
    riskLevel: 'critical',
    alternative: '창고에 방수 멀티탭 있으면 즉시 교체. 일반 콘센트는 비닐 임시 커버라도 사용.',
  },
  {
    id: 'rain-02',
    category: '우천 전기 안전',
    title: '누전차단기 15mA 이하 설치',
    description: '습기/물기 환경에서 30mA 누전차단기는 인체 감전 방지 불충분. 15mA 이하 사용.',
    regulation: 'KEC 212.2조, IEC 60364-7-706',
    riskLevel: 'critical',
    alternative: '현장에 15mA 누전차단기 없으면 30mA라도 반드시 직렬 설치. 작업 즉시 조달.',
  },
  {
    id: 'rain-03',
    category: '우천 전기 안전',
    title: '절연 장갑 착용 (최소 Class 00)',
    description: '습기 환경 전기 작업 시 절연 장갑 착용 의무화.',
    regulation: 'KOSHA Guide E-173',
    riskLevel: 'high',
    alternative: '절연장갑 없으면 고무장갑(전기용)으로 대체. 면장갑 사용 금지.',
  },
  {
    id: 'rain-04',
    category: '우천 전기 안전',
    title: '임시 배선 절연 상태 전수 확인',
    description: '빗물 침투로 절연 열화 가능. 메가(절연저항계)로 전선 절연 확인.',
    regulation: 'KEC 112.1조',
    riskLevel: 'high',
    alternative: '메가 없으면 육안으로 피복 손상 부위 점검. 의심 구간은 테이핑 후 작업.',
  },
];

/** 활선 작업 추가 체크 항목 */
const LIVE_WORK_CHECK_ITEMS: Omit<SafetyCheckItem, 'isMissing'>[] = [
  {
    id: 'live-01',
    category: '활선 작업',
    title: '활선 작업 계획서 제출',
    description: '활선 작업 전 작업 계획서 작성 및 감독자 승인.',
    regulation: '산안법 제320조, 고용노동부 고시 제2020-44호',
    riskLevel: 'critical',
    alternative: '계획서 양식 없으면 ESVA 앱에서 즉시 생성.',
  },
  {
    id: 'live-02',
    category: '활선 작업',
    title: '절연 방호구 설치',
    description: '충전부 인접 부위에 절연커버, 절연시트 설치.',
    regulation: '산안법 제320조',
    riskLevel: 'critical',
    alternative: '절연 테이프 여러 겹도 임시방편 가능. 단, 작업 전 필수.',
  },
  {
    id: 'live-03',
    category: '활선 작업',
    title: '안전 이격 거리 유지 (22.9kV: 0.6m)',
    description: '전압별 최소 안전 이격 거리: 22.9kV 0.6m, 154kV 1.6m.',
    regulation: '산안법 제321조',
    riskLevel: 'critical',
    alternative: '이격 거리 확보 불가 시 정전 작업으로 전환. 활선 강행 금지.',
  },
];

/** 폭염 시 추가 체크 항목 */
const HEAT_CHECK_ITEMS: Omit<SafetyCheckItem, 'isMissing'>[] = [
  {
    id: 'heat-01',
    category: '폭염 관리',
    title: '온도 35°C 이상 시 옥외 작업 중지 또는 단축',
    description: '폭염특보 발령 시 옥외 작업 단축 및 휴식 보장.',
    regulation: '산안법 제580조, 고용노동부 폭염 대책 지침',
    riskLevel: 'high',
    alternative: '10:00~15:00 집중 휴식. 그늘막, 식염수, 얼음팩 준비.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 조건부 항목 생성 함수
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 입력 기반 누락 항목 판정
 *
 * 기본: 모든 체크 항목 = isMissing: true (작업 전 물리적 확인 필요)
 * 인텐트 추론 가능 항목:
 *   cs-04 (감시인): 관리자 1명 이상 명시 → isMissing: false (배치 가능 상태)
 *   cs-04 (감시인): 관리자 0명 → 설명에 경고 문구 추가
 *
 * 주의: isMissing: false = "배치 가능" ≠ "물리적으로 완료됨"
 *       체크리스트에서 최종 확인은 작업자가 직접 수행해야 함.
 */
function markMissing(
  items: Omit<SafetyCheckItem, 'isMissing'>[],
  intent?: SafetyIntentResult,
): SafetyCheckItem[] {
  return items.map(item => {
    // cs-04: 외부 감시인 — 관리자 인원으로 가용성 추론
    if (item.id === 'cs-04' && intent !== undefined) {
      const supervisorCount = intent.supervisors ?? 0;
      if (supervisorCount >= 1) {
        return {
          ...item,
          isMissing: false,
          description:
            `${item.description} ` +
            `[관리자 ${supervisorCount}명 명시됨 — 외부 배치 여부 현장 확인 필수]`,
        };
      }
      // 관리자 0명: 더 강한 경고 문구
      return {
        ...item,
        isMissing: true,
        alternative:
          `⚠️ 관리자/감시인 미명시. ${item.alternative}`,
      };
    }
    // 그 외: 작업 전 미확인 상태로 초기화
    return { ...item, isMissing: true };
  });
}

/** 전체 위험도 계산 */
function calcOverallRisk(items: SafetyCheckItem[]): RiskLevel {
  const missingCritical = items.filter(i => i.isMissing && i.riskLevel === 'critical');
  const missingHigh = items.filter(i => i.isMissing && i.riskLevel === 'high');

  if (missingCritical.length > 0) return 'critical';
  if (missingHigh.length >= 2) return 'high';
  if (missingHigh.length === 1) return 'medium';
  return 'low';
}

/** 적용 규정 목록 수집 */
function collectRegulations(items: SafetyCheckItem[]): string[] {
  const regs = new Set<string>();
  items.forEach(i => {
    i.regulation.split(',').forEach(r => regs.add(r.trim()));
  });
  return Array.from(regs).sort();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 공개 분석 함수
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 현장 안전 분석 — 파서 결과 → 체크리스트 + 누락 항목 + 종합 위험도
 */
export function analyzeSafety(intent: SafetyIntentResult): SafetyAnalysisResult {
  const allItems: SafetyCheckItem[] = [];

  // 밀폐공간 기본 항목
  if (intent.isConfinedSpace) {
    allItems.push(...markMissing(CONFINED_SPACE_MANDATORY, intent));
  }

  // 우천 추가 항목
  const hasRain = intent.weather.some(w => w.condition === 'rain');
  if (hasRain) {
    allItems.push(...markMissing(RAIN_CHECK_ITEMS, intent));
  }

  // 활선 작업 추가 항목
  const hasLiveWork = intent.workTypes.some(w => w.isLiveWork);
  if (hasLiveWork) {
    allItems.push(...markMissing(LIVE_WORK_CHECK_ITEMS, intent));
  }

  // 폭염 추가 항목
  const hasHeat = intent.weather.some(w => w.condition === 'extreme_heat');
  if (hasHeat) {
    allItems.push(...markMissing(HEAT_CHECK_ITEMS, intent));
  }

  // 위치가 없거나 일반 실내/옥외인 경우 기본 전기 안전 항목 추가
  if (!intent.isConfinedSpace && !intent.location) {
    allItems.push(
      ...markMissing([
        {
          id: 'base-01',
          category: '기본 전기 안전',
          title: '작업 전 정전 확인 및 잠금/표지판(LOTO)',
          description: '작업 대상 회로 전원 차단 → 차단기 잠금 → 검전기로 확인.',
          regulation: '산안법 제319조',
          riskLevel: 'critical',
          alternative: '검전기 없으면 테스터(AC 전압 측정)로 대체. 단, 고압은 불가.',
        },
        {
          id: 'base-02',
          category: '기본 전기 안전',
          title: '보호구 착용 (절연 장갑, 절연화)',
          description: '전기 작업 시 절연 장갑, 절연화 필수 착용.',
          regulation: '산안법 제320조',
          riskLevel: 'high',
          alternative: '절연화 없으면 고무창 신발. 슬리퍼, 샌들 금지.',
        },
      ], intent),
    );
  }

  const missingCritical = allItems.filter(i => i.isMissing && i.riskLevel === 'critical');
  const missingRecommended = allItems.filter(
    i => i.isMissing && (i.riskLevel === 'high' || i.riskLevel === 'medium'),
  );
  const overallRisk = calcOverallRisk(allItems);
  const applicableRegulations = collectRegulations(allItems);

  // 요약 메시지 생성
  const summaryParts: string[] = [];
  if (intent.location) summaryParts.push(intent.location.ko);
  if (hasRain) summaryParts.push('우천');
  if (intent.isConfinedSpace) summaryParts.push('밀폐공간');
  if (hasLiveWork) summaryParts.push('활선 작업');

  const contextStr = summaryParts.length > 0 ? summaryParts.join(' + ') + ' 작업 환경. ' : '';
  const riskKo = { critical: '즉시 조치 필요', high: '높음', medium: '보통', low: '낮음' };
  const summaryKo = `${contextStr}누락 필수 항목 ${missingCritical.length}건, 권고 항목 ${missingRecommended.length}건. 종합 위험도: ${riskKo[overallRisk]}.`;

  return {
    intent,
    overallRisk,
    checkItems: allItems,
    missingCritical,
    missingRecommended,
    summaryKo,
    applicableRegulations,
    timestamp: new Date().toISOString(),
  };
}
