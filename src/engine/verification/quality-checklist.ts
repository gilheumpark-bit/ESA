/**
 * ESVA Quality Checklist — 전기 설계 5도메인 품질 검사
 * ─────────────────────────────────────────────────────
 * 코드 스튜디오의 5도메인 검사 패턴을 전기 설계로 전환.
 * 도메인: 전기안전 / 열적 / 보호계전 / 신뢰성 / 법규적합성
 * 원본 패턴: eh-universe-web/packages/quill-engine/src/pipeline/quality-checklist.ts
 *
 * PART 1: Types
 * PART 2: 5도메인 체크 항목
 * PART 3: 검사 실행
 */

// =========================================================================
// PART 1 — Types
// =========================================================================

export type QualityDomain =
  | 'electrical-safety'  // 전기안전: 감전/화재 방지
  | 'thermal'            // 열적: 허용온도, 온도상승
  | 'protection'         // 보호계전: 차단기/계전기 협조
  | 'reliability'        // 신뢰성: 여유율, 이중화
  | 'code-compliance';   // 법규적합성: KEC/NEC/IEC 준수

export type CheckSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface QualityCheck {
  id: string;
  domain: QualityDomain;
  severity: CheckSeverity;
  title: string;
  description: string;
  /** 검사 함수: params → passed 여부 */
  check: (params: Record<string, unknown>) => boolean;
}

export interface CheckResult {
  checkId: string;
  domain: QualityDomain;
  severity: CheckSeverity;
  title: string;
  passed: boolean;
  detail?: string;
}

export interface QualityReport {
  /** 도메인별 점수 (0~100) */
  scores: Record<QualityDomain, number>;
  /** 종합 점수 (0~100) */
  overallScore: number;
  /** 전체 결과 */
  results: CheckResult[];
  /** critical 위반 수 */
  criticalCount: number;
  /** 통과율 (%) */
  passRate: number;
}

// =========================================================================
// PART 2 — 5도메인 체크 항목
// =========================================================================

const CHECKS: QualityCheck[] = [
  // ── 전기안전 ──
  {
    id: 'ES-001', domain: 'electrical-safety', severity: 'critical',
    title: '접지 시스템 존재',
    description: '접지저항 또는 접지 방식이 명시되어야 합니다.',
    check: (p) => p['hasGrounding'] === true || num(p['groundResistance']) !== null,
  },
  {
    id: 'ES-002', domain: 'electrical-safety', severity: 'critical',
    title: '누전차단기(RCD) 시설',
    description: '감전 위험 회로에 누전차단기가 시설되어야 합니다.',
    check: (p) => p['hasRCD'] === true,
  },
  {
    id: 'ES-003', domain: 'electrical-safety', severity: 'major',
    title: '전선 허용전류 확보',
    description: '부하전류가 전선 허용전류 이하여야 합니다.',
    check: (p) => {
      const load = num(p['loadCurrent']);
      const amp = num(p['wireAmpacity']);
      if (load === null || amp === null) return true; // 데이터 없으면 패스
      return load <= amp;
    },
  },
  {
    id: 'ES-004', domain: 'electrical-safety', severity: 'major',
    title: '단락전류 차단 능력',
    description: '차단기 차단용량이 예상 단락전류 이상이어야 합니다.',
    check: (p) => {
      const sc = num(p['shortCircuitCurrent']);
      const bc = num(p['breakerCapacity']);
      if (sc === null || bc === null) return true;
      return bc >= sc;
    },
  },

  // ── 열적 ──
  {
    id: 'TH-001', domain: 'thermal', severity: 'major',
    title: '주위온도 보정 적용',
    description: '30°C 초과 환경에서 온도보정계수가 적용되어야 합니다.',
    check: (p) => {
      const temp = num(p['ambientTemp']);
      if (temp === null || temp <= 30) return true;
      return p['tempCorrectionApplied'] === true;
    },
  },
  {
    id: 'TH-002', domain: 'thermal', severity: 'minor',
    title: '전선 밀집 보정 적용',
    description: '2회로 이상 밀집 시 보정계수가 적용되어야 합니다.',
    check: (p) => {
      const group = num(p['groupCount']);
      if (group === null || group <= 1) return true;
      return p['groupCorrectionApplied'] === true;
    },
  },

  // ── 보호계전 ──
  {
    id: 'PR-001', domain: 'protection', severity: 'critical',
    title: '차단기 정격 ≥ 부하전류 × 1.25',
    description: 'KEC 212.3 연속부하 기준 차단기 정격이 충분해야 합니다.',
    check: (p) => {
      const load = num(p['loadCurrent']);
      const breaker = num(p['breakerRating']);
      if (load === null || breaker === null) return true;
      return breaker >= load * 1.25;
    },
  },
  {
    id: 'PR-002', domain: 'protection', severity: 'critical',
    title: '차단기 정격 ≤ 전선 허용전류',
    description: '차단기가 전선을 보호할 수 있어야 합니다.',
    check: (p) => {
      const breaker = num(p['breakerRating']);
      const amp = num(p['wireAmpacity']);
      if (breaker === null || amp === null) return true;
      return breaker <= amp;
    },
  },

  // ── 신뢰성 ──
  {
    id: 'RL-001', domain: 'reliability', severity: 'minor',
    title: '허용전류 여유율 ≥ 10%',
    description: '전선 허용전류가 부하전류 대비 10% 이상 여유가 있어야 합니다.',
    check: (p) => {
      const load = num(p['loadCurrent']);
      const amp = num(p['wireAmpacity']);
      if (load === null || amp === null) return true;
      return amp >= load * 1.1;
    },
  },
  {
    id: 'RL-002', domain: 'reliability', severity: 'info',
    title: '전압강하 여유율',
    description: '전압강하율이 허용치의 80% 이내면 양호합니다.',
    check: (p) => {
      const vd = num(p['voltageDropPercent']);
      const limit = num(p['vdLimit']);
      if (vd === null || limit === null) return true;
      return vd <= limit * 0.8;
    },
  },

  {
    id: 'ES-005', domain: 'electrical-safety', severity: 'critical',
    title: '비상회로 독립보호',
    description: '소방/비상 회로는 일반부하와 별도 보호장치로 보호되어야 합니다.',
    check: (p) => {
      if (p['hasEmergencyCircuit'] !== true) return true; // 비상회로 없으면 해당 없음
      return p['emergencyCircuitSeparateProtection'] === true;
    },
  },
  {
    id: 'ES-006', domain: 'electrical-safety', severity: 'major',
    title: 'THD 5% 이내',
    description: '인버터/재생에너지 부하의 총고조파왜율(THD)이 5% 이하여야 합니다.',
    check: (p) => {
      const thd = num(p['thdPercent']);
      if (thd === null) return true;
      return thd <= 5;
    },
  },
  {
    id: 'ES-007', domain: 'electrical-safety', severity: 'critical',
    title: '아크플래시 위험 표시',
    description: '30kA 이상 단락전류 기기에 아크플래시 경고 라벨이 필요합니다.',
    check: (p) => {
      const sc = num(p['shortCircuitCurrent_kA']);
      if (sc === null || sc < 30) return true;
      return p['arcFlashLabelApplied'] === true;
    },
  },

  // ── 법규적합성 ──
  {
    id: 'CC-001', domain: 'code-compliance', severity: 'critical',
    title: '전압강하 기준 준수',
    description: 'KEC 232.52 전압강하 허용치를 초과하지 않아야 합니다.',
    check: (p) => {
      const vd = num(p['voltageDropPercent']);
      const limit = num(p['vdLimit']);
      if (vd === null || limit === null) return true;
      return vd <= limit;
    },
  },
  {
    id: 'CC-002', domain: 'code-compliance', severity: 'major',
    title: 'KEC 표준 케이블 규격 사용',
    description: '설계에 사용된 케이블이 KEC 표준 규격이어야 합니다.',
    check: (p) => {
      const size = num(p['cableSize']);
      if (size === null) return true;
      const std = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
      return std.includes(size);
    },
  },
  {
    id: 'CC-003', domain: 'code-compliance', severity: 'major',
    title: '기준서 버전 명시',
    description: '적용된 기준서의 판/연도가 명시되어야 합니다.',
    check: (p) => typeof p['standardVersion'] === 'string' && p['standardVersion'] !== '',
  },
];

// =========================================================================
// PART 3 — 검사 실행
// =========================================================================

/** 전체 품질 검사 실행 */
export function runQualityChecklist(params: Record<string, unknown>): QualityReport {
  const results: CheckResult[] = CHECKS.map(chk => ({
    checkId: chk.id,
    domain: chk.domain,
    severity: chk.severity,
    title: chk.title,
    passed: chk.check(params),
  }));

  // 도메인별 점수 계산
  const domains: QualityDomain[] = ['electrical-safety', 'thermal', 'protection', 'reliability', 'code-compliance'];
  const scores = {} as Record<QualityDomain, number>;

  for (const domain of domains) {
    const domainResults = results.filter(r => r.domain === domain);
    if (domainResults.length === 0) { scores[domain] = 100; continue; }
    const passed = domainResults.filter(r => r.passed).length;
    scores[domain] = Math.round((passed / domainResults.length) * 100);
  }

  const overallScore = Math.round(
    domains.reduce((sum, d) => sum + scores[d], 0) / domains.length,
  );

  const criticalCount = results.filter(r => !r.passed && r.severity === 'critical').length;
  const passRate = Math.round((results.filter(r => r.passed).length / results.length) * 100);

  return { scores, overallScore, results, criticalCount, passRate };
}

/** 특정 도메인만 검사 */
export function runDomainCheck(
  domain: QualityDomain,
  params: Record<string, unknown>,
): CheckResult[] {
  return CHECKS
    .filter(c => c.domain === domain)
    .map(chk => ({
      checkId: chk.id,
      domain: chk.domain,
      severity: chk.severity,
      title: chk.title,
      passed: chk.check(params),
    }));
}

/** 체크 항목 목록 조회 (UI 표시용) */
export function getChecklistItems(): Array<{ id: string; domain: QualityDomain; severity: CheckSeverity; title: string }> {
  return CHECKS.map(c => ({ id: c.id, domain: c.domain, severity: c.severity, title: c.title }));
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  return null;
}
