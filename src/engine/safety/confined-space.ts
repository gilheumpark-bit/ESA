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
    // 규정 문면 그대로 — "18퍼센트 이상 23.5퍼센트 미만"(제618조 적정공기).
    description: '작업 전 산소 농도 18% 이상 23.5% 미만 확인. 이탈 시 즉시 대피.',
    regulation: '산업안전보건기준에 관한 규칙 제618조(적정공기 정의)·제619조',
    riskLevel: 'critical',
    alternative: '지하 공동구 진입 전 산소농도계(O2 감지기) 반드시 휴대. 없으면 작업 불가.',
  },
  {
    id: 'cs-02',
    category: '산소/가스 측정',
    title: '유해 가스 측정 (H₂S, CO, CO₂, CH₄)',
    // 안전보건규칙 제618조 "적정공기" 정의를 그대로 따른다. 2026-07-28 정정 둘:
    //  ① **이하 → 미만.** 규정은 "10피피엠 미만"·"30피피엠 미만" 이다. 정확히
    //     10ppm·30ppm 인 순간 이 문구는 "적합" 으로 읽혔는데 규정상으로는
    //     적정공기가 아니다 — 경계에서 비보수(위험) 방향이었다.
    //  ② **이산화탄소 1.5% 누락.** 적정공기는 산소·CO₂·CO·H₂S 네 항목인데
    //     CO₂ 자리에 메탄이 들어가 있었다. 메탄 10%LEL 은 폭발 기준이라
    //     따로 필요한 항목이고, CO₂ 를 대신하지 못한다 — 맨홀·오수관에서
    //     이산화탄소는 실제 질식 요인이다.
    description: '적정공기 확인 — 이산화탄소 1.5% 미만, 일산화탄소 30ppm 미만, 황화수소 10ppm 미만.'
      + ' 추가로 메탄 10%LEL 미만(폭발 하한) 확인.',
    regulation: '산업안전보건기준에 관한 규칙 제618조(적정공기 정의)·제619조',
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
    alternative: '작업 전 119와 현장 관리자 연락처를 직접 확보할 것. (앱 SOS 버튼은 화면 경보만 제공하며 외부 발송 기능은 없음)',
  },
  // ── 철수·재진입 구간 (2026-07-28 독립 심사 완전성 좌석) ──
  //
  // 앞 8 항목은 **들어가기 전**만 다뤘다. 진입 준비(측정·환기·감시인·구조장비)는
  // 촘촘한데, 나온 뒤와 다시 들어갈 때가 비어 있었다. 국내 질식 사망의
  // 전형적인 마지막 단계가 여기다 — 철수할 때 안에 남은 한 명을 세지 못한 채
  // 뚜껑을 닫는 것.
  //
  // 새 수치를 만들지 않는다. 세 항목 모두 **이미 있는 항목을 언제 다시
  // 하느냐**를 정할 뿐이고, 농도·시간 기준은 cs-01 과 스케줄러가 이미 갖고 있다
  // (§2.10 — 도메인 오라클 없이 안전 수치를 쓰지 않는다).
  {
    id: 'cs-09',
    category: '인원 관리',
    title: '출입 인원 점검 (들어간 수 = 나온 수)',
    description: '진입·퇴장 때마다 인원을 세어 기록한다. 작업 종료 시 들어간 수와'
      + ' 나온 수가 같은지 확인한 뒤에야 개구부를 닫는다.',
    regulation: '산안법 밀폐공간 작업 (인원 확인)',
    riskLevel: 'critical',
    alternative: '감시인이 종이에 이름을 적고 나올 때 지운다. 이름이 남아 있으면 사람이 남아 있다.',
  },
  {
    id: 'cs-10',
    category: '인원 관리',
    title: '관계자 외 출입금지 표지',
    description: '측정·환기가 끝나지 않은 공간에 다른 작업자가 내려가지 않도록'
      + ' 개구부에 출입금지 표지를 세운다.',
    regulation: '산안법 밀폐공간 작업 (출입 금지)',
    riskLevel: 'high',
    alternative: '표지가 없으면 개구부를 덮거나 감시인이 상주해 접근을 막을 것.',
  },
  {
    id: 'cs-11',
    category: '작업 중단·재개',
    title: '대피 후 재진입 조건',
    description: '경보·이상 징후로 대피했다면 그대로 다시 들어가지 않는다.'
      + ' 재환기 → 재측정(cs-01 기준) → 감시인 재확인을 마친 뒤에만 재진입한다.',
    regulation: '산안법 밀폐공간 작업 (작업 재개)',
    riskLevel: 'critical',
    alternative: '측정기가 없으면 재진입하지 않는다. 대피는 항상 재진입으로 이어지므로 이 순간이 규칙이 필요한 자리다.',
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
    description: '습기/물기 환경에서 30mA 누전차단기는 인체 감전 방지 불충분. 15mA 이하·0.03초 이내 사용.',
    regulation: 'KEC 212.2조, IEC 60364-7-706',
    riskLevel: 'critical',
    // 2026-07-28 정정 — 앞 문안은 "30mA라도 반드시 직렬 설치" 였다. 바로 윗줄이
    // "30mA 는 불충분" 이라고 말해 놓고 대안이 그 30mA 를 권했다. 이 파일의
    // 다른 항목(live-03)은 "확보 불가 시 정전 작업으로 전환, 강행 금지" 인데
    // 여기만 미달 장비로 강행하라고 읽혔다.
    alternative: '15mA 누전차단기가 없으면 **이 요건을 만족하지 못한다** — 정전 작업으로 전환하거나 조달 후 착수할 것.'
      + ' 30mA 만 있는 경우 없는 것보다는 낫지만 물기 환경 요건은 충족하지 않는다(그 상태로 활선 강행 금지).',
  },
  {
    id: 'rain-03',
    category: '우천 전기 안전',
    // 등급은 전압으로 정해진다 — Class 00 은 **최대 사용전압 500V** 다
    // (IEC 60903). 앞 문안은 "최소 Class 00" 이라고만 해서 600V·1,000V
    // 회로에서도 충분한 것으로 읽혔다. 저압은 1,000V 까지다.
    title: '절연 장갑 착용 (회로 전압에 맞는 등급)',
    description: '습기 환경 전기 작업 시 절연 장갑 착용 의무. 등급은 회로 전압으로 고른다 —'
      + ' Class 00은 최대 사용전압 500V, Class 0은 1,000V(IEC 60903). 380/440V는 00 이상, 600V 이상은 0 이상.',
    regulation: 'KOSHA Guide E-173, IEC 60903(등급별 최대 사용전압)',
    riskLevel: 'high',
    // 앞 문안은 "고무장갑(전기용)으로 대체" 였다. 내압 시험을 거치지 않은
    // 장갑은 정격이 없어 절연 장갑을 대신하지 못한다 — 착용자가 보호받고
    // 있다고 믿게 만드는 쪽이 더 위험하다.
    alternative: '등급 표시와 시험 유효기간이 확인된 절연 장갑만 사용. 일반 고무장갑은 정격이 없어 대체 불가 —'
      + ' 없으면 정전 작업으로 전환할 것. 면장갑은 절연 성능이 없다.',
  },
  {
    id: 'rain-04',
    category: '우천 전기 안전',
    title: '임시 배선 절연 상태 전수 확인',
    description: '빗물 침투로 절연 열화 가능. 메가(절연저항계)로 전선 절연 확인.',
    regulation: 'KEC 112 (용어 정의)',
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
    // 2026-07-28 정정 — 두 값 다 **규정보다 짧았다**(사람이 더 가까이 가도
    // 된다고 읽히는 방향):
    //   22.9kV  0.6m → **0.9m**   (표의 2~15kV 행 60cm 을 잘못 가져다 씀)
    //   154kV   1.6m → **1.7m**   (145kV 초과 169kV 이하 = 170cm)
    // 이 제품의 대상이 154kV 급 수전설비라 특히 이 두 값이 중요하다.
    // 공개 문헌 2 곳에서 같은 값을 확인했다(표준 원문 대조는 아님) —
    // `confined-space-domain.test.ts` 에 검증 수준을 적어 두었다.
    //
    // **13 행 중 2 행만 등재돼 있다(2026-07-28 독립 심사 도메인 좌석).**
    // 154kV 수전설비의 소내 전압 — 6.6/3.3kV · 380/440V · 220V — 이 전부
    // 없다. 특히 저압 구간은 값이 작아지는 게 아니라 **"접촉금지"**(숫자
    // 없음)로 갈리는 구간이 있어서, 없는 것을 "작으니 괜찮다" 로 읽으면
    // 위험하다.
    //
    // **11 행을 지어 넣지 않는다.** 법령 별표가 이미지라 원문 텍스트를 못
    // 구했고(4 회 시도), 2 차 문헌만으로 현장 안전 수치를 등재하는 것은 이
    // 리포가 아크플래시에서 이미 한 번 한 실수다(§2.10). 대신 **없다는
    // 사실을 문구에 적는다** — 조용한 공백을 보이는 공백으로.
    title: '안전 이격 거리 유지 (22.9kV: 0.9m)',
    description: '충전전로 접근 한계거리: 22.9kV 0.9m, 154kV 1.7m.'
      + ' **이 앱에는 이 두 전압만 등재돼 있다.** 그 밖의 전압(6.6kV·380V·220V 등)은'
      + ' 제321조 제1항 표를 직접 확인할 것 — 값이 없는 것은 이격이 필요 없다는'
      + ' 뜻이 아니다. 낮은 전압 구간에는 거리 대신 "접촉금지" 로 정해진 구간도 있다.',
    regulation: '산업안전보건기준에 관한 규칙 제321조 제1항 [접근 한계거리 표]',
    riskLevel: 'critical',
    alternative: '이격 거리 확보 불가 시 정전 작업으로 전환. 활선 강행 금지.',
  },
];

/** 폭염 시 추가 체크 항목 */
const HEAT_CHECK_ITEMS: Omit<SafetyCheckItem, 'isMissing'>[] = [
  {
    id: 'heat-01',
    category: '폭염 관리',
    // 2026-07-28 정정 — 기준이 두 겹으로 틀렸다. 둘 다 **더 늦게 쉬게** 만든다:
    //   · 임계 35°C → **31°C** (법정 "폭염작업" 정의)
    //   · 재는 값이 기온 → **체감온도**. 습도가 높으면 기온 31°C 에서도
    //     체감온도는 그보다 높다. 기온으로 재면 늘 늦게 걸린다.
    // 2024-10-22 개정 산업안전보건법(2025-06-01 시행)이 폭염을 사업주
    // 보건조치 대상으로 신설했고, 안전보건규칙이 2025-07-17 개정·시행됐다.
    // 조문 번호는 공개 자료 두 곳에서 확인하지 못해 **적지 않는다** — 확인
    // 못 한 번호를 다는 것이 이 리포가 반복해 온 잘못이다(§2.10).
    title: '체감온도 31°C 이상(폭염작업) — 작업시간대 조정 또는 휴식 부여',
    description: '체감온도를 측정해 기록·보관한다. 31°C 이상이면 옥외는 작업시간대 조정 또는 휴식 부여가 의무다.'
      + ' 기온이 아니라 체감온도 기준 — 습할수록 기온보다 높게 나온다. 온열질환 의심 시 즉시 119.',
    regulation: '산업안전보건기준에 관한 규칙 온열질환 예방 조항(2025-06-01 시행 · 2025-07-17 개정)',
    riskLevel: 'high',
    alternative: '체감온도계가 없으면 기상청 체감온도를 현장 기준으로 사용. 10:00~15:00 집중 휴식, 그늘막·식염수·얼음팩 준비.',
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
/**
 * 파서가 읽어 낸 **위험 조건 중 체크리스트가 다루지 않는 것**들.
 *
 * 표를 명시적으로 둔다 — 나중에 어느 조건의 항목을 만들면 그 줄을 지우면
 * 된다. 반대로 파서에 새 조건을 추가하고 항목을 안 만들면 여기 자동으로
 * 잡힌다(`covered` 접두사를 안 붙였으므로).
 *
 * `clear`(맑음)·`indoor`·`outdoor` 는 그 자체로 위험 조건이 아니라 넣지 않는다.
 * 넣으면 상시 고지가 떠서 사용자가 이 항목 전체를 무시하게 된다.
 */
const UNCOVERED_HAZARDS = {
  weather: {
    snow: '눈',
    wind: '강풍',
    fog: '안개',
    thunder: '낙뢰',
  } as Record<string, string>,
  location: {
    elevated: '고소(전주·철탑·고가)',
    rooftop: '옥상',
    underground: '지하',
  } as Record<string, string>,
  /** 활선(`live_work`)만 전용 항목이 있다. 나머지는 기본 전기 항목만 걸린다. */
  workType: {
    transformer_work: '변압기 작업',
    panel_work: '배전반·분전반 작업',
    grounding: '접지 작업',
    cable_pulling: '입선·케이블 포설',
  } as Record<string, string>,
};

/** 이미 만들어진 항목이 그 조건을 실제로 덮는지 — id 접두사로 본다. */
function describeUncovered(
  intent: SafetyIntentResult,
  items: SafetyCheckItem[],
): string[] {
  const has = (prefix: string) => items.some((i) => i.id.startsWith(prefix));
  const out: string[] = [];

  for (const w of intent.weather) {
    const ko = UNCOVERED_HAZARDS.weather[w.condition];
    if (ko) out.push(ko);
  }
  const locKo = intent.location && UNCOVERED_HAZARDS.location[intent.location.type];
  if (locKo) out.push(locKo);
  for (const t of intent.workTypes) {
    const ko = UNCOVERED_HAZARDS.workType[t.type];
    if (ko) out.push(ko);
  }

  // 표에 없는데도 항목이 안 붙은 경우를 대비 — 우천·폭염·활선·밀폐공간은
  // 항목이 있어야 정상이다. 없으면 그것도 공백이므로 함께 밝힌다.
  if (intent.weather.some((w) => w.condition === 'rain') && !has('rain-')) out.push('우천');
  if (intent.weather.some((w) => w.condition === 'extreme_heat') && !has('heat-')) out.push('폭염');
  if (intent.workTypes.some((w) => w.isLiveWork) && !has('live-')) out.push('활선 작업');
  if (intent.isConfinedSpace && !has('cs-')) out.push('밀폐공간');

  return [...new Set(out)];
}

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

  // 기본 전기 안전 항목 — **모든** 전기 작업에 적용한다.
  //
  // 이전에는 `&& !intent.location` 이 붙어 작업 위치를 입력할수록 체크리스트가
  // 비는 역전이 있었다(전기실·옥상 → 0항목 'low' 판정). 그건 고쳤는데
  // `!intent.isConfinedSpace` 를 남겨 뒀고, 주석은 "밀폐공간은 전용 필수항목을
  // 가지므로 제외" 라고 적었다. **그 전용 8항목에 전기 항목이 하나도 없다.**
  //
  // 전기 기술자가 맨홀·공동구에 들어가는 이유는 그 안의 지중 케이블·접속함이다.
  // 그 순간 앱이 산소·가스·환기만 말하고 정전 확인과 절연 보호구를 빼면, 가장
  // 전기 위험이 큰 자리에서 전기 항목이 0 이 된다 — 게다가 화면은 그 상태로
  // "8/8 (100%)" 를 띄운다(2026-07-28 독립 심사 완전성 좌석 실행 실측:
  // '맨홀 내부 작업 2명' → cs-01~08, 전기 0).
  {
    allItems.push(
      ...markMissing([
        {
          id: 'base-01',
          category: '기본 전기 안전',
          title: '작업 전 정전 확인 및 잠금/표지판(LOTO)',
          description: '작업 대상 회로 전원 차단 → 차단기 잠금·표지 → 검전기로 무전압 확인.',
          regulation: '산안법 제319조',
          riskLevel: 'critical',
          // 앞서 여기는 '고압은 불가' 로 끝났다 — 갈 곳을 안 주는 막다른 골목이다.
          // 같은 파일의 다른 항목(live-03·rain-02)은 전부 대안을 준다.
          alternative: '저압은 테스터(AC 전압 측정)로 대체 가능. 고압은 대체 불가 —'
            + ' 고압 검전기를 조달할 때까지 작업을 시작하지 않는다.',
        },
        {
          id: 'base-02',
          category: '기본 전기 안전',
          title: '보호구 착용 (절연 장갑, 절연화)',
          description: '전기 작업 시 절연 장갑·절연화 필수 착용. 둘 다 회로 전압에 맞는 등급으로 고른다.',
          regulation: '산안법 제320조',
          riskLevel: 'high',
          // rain-03(절연 장갑)과 같은 규율 — 정격 없는 대체품을 권하지 않는다.
          // 앞 문안은 "절연화 없으면 고무창 신발" 이었다. 고무창은 절연 시험을
          // 거치지 않아 정격이 없고, 신은 사람은 보호받는다고 믿게 된다.
          alternative: '등급 표시가 있는 절연화만 사용. 일반 고무창 신발은 정격이 없어 대체 불가 —'
            + ' 없으면 정전 작업으로 전환할 것. 슬리퍼·샌들은 논외다.',
        },
        // ── 정전 작업의 나머지 절반 (2026-07-28 독립 심사 완전성 좌석) ──
        //
        // base-01 이 `산안법 제319조` 를 근거로 달고 있는데 실제 문면은
        // "차단 → 잠금 → 검전" 셋뿐이었다. 조문은 그보다 길고, 빠진 것들이
        // 하필 **검전을 통과한 뒤에 사람을 죽이는 것들**이다.
        //
        // 154kV 수전설비에서 검전이 정상이어도 병행 선로 유도전압과 케이블
        // 정전용량 잔류전하가 남는다 — 접지 없이 만지면 감전이다. 반대로
        // 접지를 걸어 둔 것을 잊고 재투입하면 3상 단락 + 아크플래시다.
        // 이 두 사고가 아래 두 항목이 존재하는 이유다.
        //
        // 조문 번호는 공개 문헌 경유다(법령 원문 DB 직접 조회 아님) — 이
        // 파일의 다른 항목과 같은 수준이다. 항목의 필요성 자체는 번호와
        // 무관하게 성립한다.
        {
          id: 'base-03',
          category: '기본 전기 안전',
          title: '잔류전하 방전 및 단락접지 설치',
          description: '검전으로 무전압을 확인한 뒤 잔류전하를 방전하고, 작업 구간 양단에'
            + ' 단락접지기구를 설치한다. 케이블·콘덴서 회로와 병행 선로가 있는 구간은 필수 —'
            + ' 검전 통과가 무전압 유지를 보장하지 않는다.',
          regulation: '산안법 제319조(정전전로에서의 전기작업)',
          riskLevel: 'critical',
          alternative: '단락접지기구가 없으면 작업을 시작하지 않는다. 대체 수단 없음.',
        },
        {
          id: 'base-04',
          category: '기본 전기 안전',
          title: '재통전 전 확인 (단락접지 철거·인원 대피·공구 회수)',
          description: '전원을 되돌리기 전에 단락접지기구를 모두 철거하고, 작업 인원이'
            + ' 충전 예정 구간 밖으로 나왔는지와 공구·자재가 남지 않았는지 확인한 뒤'
            + ' 잠금·표지를 해제한다. 철거 누락 상태의 재투입은 3상 단락이 된다.',
          regulation: '산안법 제319조(정전전로에서의 전기작업)',
          riskLevel: 'critical',
          alternative: '설치한 사람이 철거를 확인한다. 설치 수량을 적어 두고 같은 수량을 회수한다.',
        },
      ], intent),
    );
  }

  /**
   * **인식했는데 다룰 항목이 없는 조건을 밝힌다.**
   *
   * 실측(2026-07-28 독립 심사 완전성 좌석): `'옥외 철탑 점검, 낙뢰, 2명'` 을
   * 넣으면 파서가 **신뢰도 1.00** 으로 낙뢰와 고소를 정확히 읽고, 체크리스트는
   * 기본 전기 항목 2 개만 낸다. 낙뢰 0 줄, 추락 방지 0 줄. 같은 일이
   * 강풍·눈·안개, 그리고 변압기·개폐기 조작 같은 작업 유형에서도 일어난다.
   *
   * 사용자는 자기가 낙뢰를 적었고 앱이 만점으로 분석했다고 보므로 **앱의
   * 침묵을 "그 조건은 문제없음" 으로 읽는다.** 이게 이 파일에서 가장 위험한
   * 형태다 — 틀린 항목보다 없는 항목이 안전해 보인다.
   *
   * 없는 항목을 지어내지 않는다(§2.10 — 도메인 오라클 없이 안전 지시를 쓰는
   * 것은 이 리포가 아크플래시에서 이미 한 번 한 실수다). 대신 **다루지 않는다는
   * 사실 자체를 항목으로 만든다.** 조용한 공백을 보이는 공백으로 바꾼다.
   */
  const uncovered = describeUncovered(intent, allItems);
  if (uncovered.length > 0) {
    allItems.push({
      id: 'gap-01',
      category: '이 앱이 다루지 않는 조건',
      title: `${uncovered.join(' · ')} — 별도 확인 필요`,
      description: `입력에서 ${uncovered.join(' · ')} 조건을 읽었지만 이 체크리스트에는`
        + ' 해당 항목이 없습니다. 항목이 없는 것은 안전하다는 뜻이 아닙니다 —'
        + ' 이 앱이 아직 다루지 않는 범위입니다. 해당 조건의 작업 중지 기준과'
        + ' 보호 조치는 사내 절차와 관련 규정으로 별도 확인하십시오.',
      regulation: '해당 없음 (범위 밖 고지)',
      riskLevel: 'high',
      isMissing: true,
      alternative: '해당 조건을 다루는 절차서가 없으면 작업 전 관리감독자와 확인할 것.',
    });
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
