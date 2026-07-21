/**
 * 초급 도면 검토 — 단일 도면 하이브리드 사슬 (계산 + 기준 + 분석 + 결론)
 * ─────────────────────────────────────────────────────────────────────
 * 설계 정본: docs/project/design/2026-07-21-drawing-review-ladder.md
 *
 * 원칙(도메인 진실 규칙팩):
 *  - 무발명: 도면에 적힌 값만 입력으로 쓴다. 없으면 UNKNOWN("미기재") —
 *    가정이 불가피한 항목(공사방법)은 verdict 안에 가정을 명시한다.
 *  - 기준 결박: 모든 판정에 근거(KEC 표 키·규칙 산식)를 붙인다.
 *  - 조수, 심판 아님: 부합/부적합/판정불가 + 근거까지만. 최종 판정은 유자격자.
 *  - false-PASS(부적합을 적합으로)가 최악 — 애매하면 UNKNOWN.
 */

import type { SLDAnalysis, SLDComponent } from '@/lib/sld-recognition';
import { getAmpacity, KEC_CABLE_SIZES } from '@/data/ampacity-tables/kec-ampacity';
import type { InsulationType } from '@/data/ampacity-tables/kec-ampacity';
import { parseSpecText } from '@/engine/topology/spec-text';

export interface ReviewFinding {
  rule: 'AT-LE-AF' | 'CABLE-AMPACITY' | 'TR-MAIN-CURRENT' | 'DATA-GAP';
  severity: 'FAIL' | 'WARN' | 'PASS' | 'UNKNOWN';
  subject: string;
  componentId?: string;
  /** 도면에 적힌 값 그대로 */
  given: Record<string, string>;
  /** 계산값 (있을 때만) */
  computed?: Record<string, string>;
  /** 기준값 + 출처 */
  limit?: { value: string; source: string };
  verdict: string;
}

export interface ReviewReport {
  findings: ReviewFinding[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  coverage: {
    breakersTotal: number;
    breakersRatedParsed: number;
    breakersWithCable: number;
  };
  disclaimer: string;
}

const DISCLAIMER =
  '검토 보조 결과입니다 — 부합/부적합은 도면에 적힌 값과 KEC 표 대조에 근거하며, 최종 판정·지시는 유자격 기술자의 몫입니다.';

// 도면 케이블 표기 → KEC 절연 매핑 (국내 표기 관례)
const INSULATION_BY_CABLE: Record<string, InsulationType> = {
  CV: 'XLPE', FCV: 'XLPE', 'FR-CV': 'XLPE', 'TFR-CV': 'XLPE', XLPE: 'XLPE',
  HIV: 'PVC', IV: 'PVC', VV: 'PVC', HFIX: 'PVC',
};

/**
 * 컴포넌트의 전기 스펙 파생 — rating 필드뿐 아니라 라벨·결속 부하 텍스트까지
 * 결합해 공용 파서(spec-text)로 읽는다. 실측(수변전 p5): 정격이 rating이 아니라
 * properties.load("3P 250/100A"·"7.2KV 3P 630A")에 실려 breakersRatedParsed=0으로
 * 검토가 굶었다 — 필드 하나만 보면 추출과 검토 사이가 끊긴다.
 */
function deriveSpec(c: SLDComponent) {
  const joined = [c.label, c.rating, c.current, c.properties?.load]
    .filter(Boolean)
    .join(' ');
  return parseSpecText(joined);
}

function parseSq(conductorSize?: string): number | null {
  if (!conductorSize) return null;
  const m = conductorSize.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

/** KEC 표에 있는 표준 굵기로만 조회한다 — 비표준 값은 판정하지 않는다(무발명). */
function isKecSize(size: number): boolean {
  return (KEC_CABLE_SIZES as readonly number[]).includes(size);
}

export function reviewAnalysis(analysis: SLDAnalysis): ReviewReport {
  const findings: ReviewFinding[] = [];
  const breakers = analysis.components.filter((c) => c.type === 'breaker');

  // ── 규칙 1: AT ≤ AF (트립은 프레임을 넘을 수 없다 — 차단기 구조 정의) ──
  const specByBreaker = new Map<string, ReturnType<typeof deriveSpec>>();
  let ratedParsed = 0;
  for (const b of breakers) {
    const spec = deriveSpec(b);
    specByBreaker.set(b.id, spec);
    if (spec.frameA === undefined && spec.current === undefined) continue;
    ratedParsed += 1;
    if (spec.frameA !== undefined && spec.tripA !== undefined && spec.tripA > spec.frameA) {
      findings.push({
        rule: 'AT-LE-AF',
        severity: 'FAIL',
        subject: subjectOf(b),
        componentId: b.id,
        given: { rating: `${spec.frameA}AF/${spec.tripA}AT` },
        verdict: `트립 ${spec.tripA}AT가 프레임 ${spec.frameA}AF를 초과 — 표기 오류 또는 선정 오류`,
      });
    }
  }

  // ── 규칙 2: 차단기 AT ≤ 결속 케이블 KEC 허용전류 ──
  // 케이블 스펙은 연결(conductorSize·cableType)에 결속돼 있다 — 차단기에 붙은
  // 연결 중 스펙 있는 것만 판정. 공사방법은 도면에 안 적히는 관례라 관로(conduit)
  // 가정 — verdict에 명시(사내규정 온보딩 시 교체 지점).
  const connsByComp = new Map<string, Array<{ sq: number; cableType?: string }>>();
  for (const conn of analysis.connections) {
    const sq = parseSq(conn.conductorSize);
    if (sq == null) continue;
    for (const end of [conn.from, conn.to]) {
      if (!end.startsWith('comp_')) continue;
      const arr = connsByComp.get(end) ?? [];
      arr.push({ sq, cableType: conn.cableType });
      connsByComp.set(end, arr);
    }
  }

  let breakersWithCable = 0;
  for (const b of breakers) {
    const cables = connsByComp.get(b.id);
    if (!cables || cables.length === 0) continue;
    const spec = specByBreaker.get(b.id) ?? deriveSpec(b);
    // 정격전류의 정본은 트립(AT), 없으면 단독 전류 표기(예: VCB 630A).
    const tripA = spec.tripA ?? spec.current;
    if (tripA == null) continue;
    breakersWithCable += 1;

    // 여러 케이블이 결속되면 가장 가는 것이 병목이다.
    const worst = cables.reduce((a, c) => (c.sq < a.sq ? c : a));
    if (!isKecSize(worst.sq)) {
      findings.push({
        rule: 'CABLE-AMPACITY',
        severity: 'UNKNOWN',
        subject: subjectOf(b),
        componentId: b.id,
        given: { trip: `${tripA}A`, cable: `${worst.sq}sq ${worst.cableType ?? ''}`.trim() },
        verdict: `${worst.sq}sq는 KEC 표준 굵기가 아님 — 표기 재확인 필요(판정 보류)`,
      });
      continue;
    }
    const insulation = INSULATION_BY_CABLE[(worst.cableType ?? 'CV').toUpperCase()] ?? 'XLPE';
    let ampacity: number;
    let sourceKey: string;
    try {
      const r = getAmpacity({ size: worst.sq, conductor: 'Cu', insulation, installation: 'conduit' });
      ampacity = r.corrected;
      sourceKey = `KEC Cu_${insulation}_conduit ${worst.sq}sq`;
    } catch {
      findings.push({
        rule: 'CABLE-AMPACITY',
        severity: 'UNKNOWN',
        subject: subjectOf(b),
        componentId: b.id,
        given: { trip: `${tripA}A`, cable: `${worst.sq}sq` },
        verdict: `KEC 표에 ${worst.sq}sq/${insulation} 조합 없음 — 판정 보류`,
      });
      continue;
    }

    const base = {
      rule: 'CABLE-AMPACITY' as const,
      subject: subjectOf(b),
      componentId: b.id,
      given: {
        trip: `${tripA}A`,
        cable: `${worst.sq}sq ${worst.cableType ?? '(종류 미기재→XLPE 가정)'}`.trim(),
      },
      computed: { 허용전류: `${ampacity}A` },
      limit: { value: `${ampacity}A`, source: sourceKey },
    };
    if (tripA > ampacity) {
      findings.push({
        ...base,
        severity: 'FAIL',
        verdict: `차단기 ${tripA}A > 케이블 허용전류 ${ampacity}A — 케이블이 차단기보다 먼저 위험 (가정: 공사방법 관로·주위 30°C)`,
      });
    } else if (tripA > ampacity * 0.8) {
      findings.push({
        ...base,
        severity: 'WARN',
        verdict: `차단기 ${tripA}A가 허용전류 ${ampacity}A의 80%를 초과 — 여유 부족 (가정: 관로·30°C)`,
      });
    } else {
      findings.push({
        ...base,
        severity: 'PASS',
        verdict: `차단기 ${tripA}A ≤ 허용전류 ${ampacity}A — 부합 (가정: 관로·30°C)`,
      });
    }
  }

  // ── 규칙 3: TR 정격 2차전류 vs 페이지 최대 차단기 (정보 제공 — WARN까지만) ──
  // 2차전압이 같은 라벨에 무모호하게 적힌 TR만 계산한다. TR 라벨 관례:
  // "6.6KV/380V"·"380/220V" — 마지막 전압 토큰을 2차로 읽되, 복수 해석이
  // 가능하면(380-220V) 낮은 쪽이 아닌 상간전압(앞 값)을 쓴다.
  const transformers = analysis.components.filter((c) => c.type === 'transformer');
  for (const tr of transformers) {
    const spec = deriveSpec(tr);
    const hasKva = spec.power !== undefined && /VA$/i.test(spec.powerUnit ?? '');
    const labelAll = [tr.label, tr.rating, tr.properties?.load].filter(Boolean).join(' ');
    const secM = labelAll.match(/\/\s*(\d{3,4})(?:\s*[-/]\s*\d{3})?\s*V\b/i);
    if (!hasKva || !secM) {
      findings.push({
        rule: 'TR-MAIN-CURRENT',
        severity: 'UNKNOWN',
        subject: subjectOf(tr),
        componentId: tr.id,
        given: { rating: tr.rating ?? '(미파싱)', label: tr.label ?? '' },
        verdict: '용량 또는 2차전압이 무모호하게 파싱되지 않아 2차전류 판정 보류(무발명)',
      });
      continue;
    }
    const kva = (spec.power as number) * ((spec.powerUnit ?? '').toUpperCase() === 'MVA' ? 1000 : 1);
    const v2 = parseInt(secM[1], 10);
    const i2 = (kva * 1000) / (Math.sqrt(3) * v2);
    findings.push({
      rule: 'TR-MAIN-CURRENT',
      severity: 'PASS',
      subject: subjectOf(tr),
      componentId: tr.id,
      given: { rating: `${kva}kVA`, secondary: `${v2}V` },
      computed: { '정격 2차전류': `${Math.round(i2)}A` },
      limit: { value: `${Math.round(i2)}A`, source: 'I₂ = kVA×1000/(√3×V₂)' },
      verdict: `정격 2차전류 ${Math.round(i2)}A — 2차 주차단기 선정 대조 기준값(정보 제공)`,
    });
  }

  // ── 규칙 4: 판정 불가의 정직 집계 (무발명 원칙의 잔여 선언) ──
  const gapCable = breakers.length - breakersWithCable;
  const gapRating = breakers.length - ratedParsed;
  if (breakers.length > 0 && (gapCable > 0 || gapRating > 0)) {
    findings.push({
      rule: 'DATA-GAP',
      severity: 'UNKNOWN',
      subject: '페이지 전체',
      given: {
        '케이블 미결속 차단기': `${gapCable}/${breakers.length}`,
        '정격(AF/AT) 미파싱 차단기': `${gapRating}/${breakers.length}`,
      },
      verdict:
        '이 회로들은 이 도면만으로 케이블 판정 불가 — 분기 케이블은 통상 간선 스케줄(표)에 있다(중급 교차 검토 대상)',
    });
  }

  const summary = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  for (const f of findings) {
    if (f.severity === 'PASS') summary.pass += 1;
    else if (f.severity === 'WARN') summary.warn += 1;
    else if (f.severity === 'FAIL') summary.fail += 1;
    else summary.unknown += 1;
  }

  return {
    findings,
    summary,
    coverage: {
      breakersTotal: breakers.length,
      breakersRatedParsed: ratedParsed,
      breakersWithCable,
    },
    disclaimer: DISCLAIMER,
  };
}

function subjectOf(c: SLDComponent): string {
  const load = c.properties?.load;
  return load ? `${c.label ?? c.id} [${load}]` : (c.label ?? c.id);
}

// IDENTITY_SEAL: review/circuit-review | role=초급 단일도면 하이브리드 검토(계산+기준+결론) | inputs=SLDAnalysis | outputs=ReviewReport
