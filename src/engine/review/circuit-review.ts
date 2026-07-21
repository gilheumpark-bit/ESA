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
import type { InsulationType, InstallationMethod } from '@/data/ampacity-tables/kec-ampacity';
import { parseSpecText } from '@/engine/topology/spec-text';
import {
  smallestFrameFor,
  largestTripAtMost,
  IEC_FRAME_SOURCE,
  IEC_TRIP_SOURCE,
} from '@/data/breaker-standards/iec-60947-2-frames';

/**
 * 무발명 시정 제안 — 표준(IEC 정격 사다리)·KEC 표에서 역산한 후보만 담는다.
 * action은 "무엇을 어떤 표준값으로"이고, basis는 그 값의 출처다. 출처를 붙일 수
 * 없으면(사다리 범위 밖·표에 없음) 제안을 아예 만들지 않는다 — 숫자 발명 금지.
 * 사내규정이 로드되면 그 저자 제공 remedy가 이 일반 제안을 우선한다(custom-rules).
 */
export interface ReviewProposalOption {
  /** 시정 방향 — 표준값을 명시한 문장 (예: "프레임을 160AF 이상으로 (트립 150AT 유지)") */
  action: string;
  /** 그 값의 근거 표/규격 (예: "IEC 60947-2 표준 프레임 정격", "KEC 허용전류표") */
  basis: string;
}

export interface ReviewFinding {
  rule: 'AT-LE-AF' | 'CABLE-AMPACITY' | 'TR-MAIN-CURRENT' | 'DATA-GAP';
  /** INFO = 계산 참고값(부합 판정 아님) — summary.pass에 계수하지 않는다 */
  severity: 'FAIL' | 'WARN' | 'PASS' | 'UNKNOWN' | 'INFO';
  subject: string;
  componentId?: string;
  /** 도면에 적힌 값 그대로 */
  given: Record<string, string>;
  /** 계산값 (있을 때만) */
  computed?: Record<string, string>;
  /** 기준값 + 출처 */
  limit?: { value: string; source: string };
  verdict: string;
  /** 무발명 시정 제안 — 표준/KEC 역산 후보. 출처 없으면 생략(숫자 발명 금지) */
  proposal?: ReviewProposalOption[];
}

export interface ReviewReport {
  findings: ReviewFinding[];
  summary: { pass: number; warn: number; fail: number; unknown: number; info: number };
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

/**
 * 트립을 견디는 **최소** KEC 표준 굵기(보정 허용전류 × 조수 ≥ tripA)를 표에서
 * 역산한다 — 케이블 상향 제안의 무발명 출처. 표 최대 굵기로도 못 견디면 null
 * (발명 대신 보류). KEC_CABLE_SIZES는 이미 오름차순이라 첫 만족값이 최소.
 */
function smallestCableFor(
  tripA: number,
  insulation: InsulationType,
  installation: InstallationMethod,
  parallel: number,
): { sq: number; ampacity: number } | null {
  for (const size of KEC_CABLE_SIZES) {
    try {
      const r = getAmpacity({ size, conductor: 'Cu', insulation, installation });
      const amp = r.corrected * parallel;
      if (amp >= tripA) return { sq: size, ampacity: amp };
    } catch {
      continue;
    }
  }
  return null;
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
      // 무발명 제안: 표준 정격 사다리 역산 — 프레임 유지 시 트립 하향, 트립 유지 시
      // 프레임 상향. 사다리 밖이면 해당 후보를 넣지 않는다(숫자 발명 금지).
      const proposal: ReviewProposalOption[] = [];
      const tripDown = largestTripAtMost(spec.frameA);
      const frameUp = smallestFrameFor(spec.tripA);
      if (tripDown !== null) {
        proposal.push({
          action: `트립을 ${tripDown}AT 이하로 (프레임 ${spec.frameA}AF 유지)`,
          basis: IEC_TRIP_SOURCE,
        });
      }
      if (frameUp !== null) {
        proposal.push({
          action: `프레임을 ${frameUp}AF 이상으로 (트립 ${spec.tripA}AT 유지)`,
          basis: IEC_FRAME_SOURCE,
        });
      }
      findings.push({
        rule: 'AT-LE-AF',
        severity: 'FAIL',
        subject: subjectOf(b),
        componentId: b.id,
        given: { rating: `${spec.frameA}AF/${spec.tripA}AT` },
        verdict: `트립 ${spec.tripA}AT가 프레임 ${spec.frameA}AF를 초과 — 표기 오류 또는 선정 오류`,
        ...(proposal.length > 0 ? { proposal } : {}),
      });
    }
  }

  // ── 규칙 2: 차단기 AT ≤ 결속 케이블 KEC 허용전류 ──
  // 케이블 스펙은 연결(conductorSize·cableType)에 결속돼 있다 — 차단기에 붙은
  // 연결 중 스펙 있는 것만 판정. 공사방법은 도면에 안 적히는 관례라 관로(conduit)
  // 가정 — verdict에 명시(사내규정 온보딩 시 교체 지점).
  const connsByComp = new Map<string, Array<{ sq: number; cableType?: string; parallel: number }>>();
  for (const conn of analysis.connections) {
    const sq = parseSq(conn.conductorSize);
    if (sq == null) continue;
    const parallel = conn.parallelCount && conn.parallelCount >= 2 ? conn.parallelCount : 1;
    for (const end of [conn.from, conn.to]) {
      if (!end.startsWith('comp_')) continue;
      const arr = connsByComp.get(end) ?? [];
      arr.push({ sq, cableType: conn.cableType, parallel });
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
    // 병렬 다조는 허용전류가 조수배다(버그 사냥 F5): "150sq x 2"를 단조로 보면
    // 옳은 도면을 과전류 FAIL로 오판한다. IEC/KEC 병렬 접속은 집합보정이 별도로
    // 붙지만(보수측), 무발명 원칙상 여기선 조수 선형배까지만 반영하고 verdict에
    // 병렬 전제를 명시한다.
    const parallel = worst.parallel;
    let ampacity: number;
    let sourceKey: string;
    try {
      const r = getAmpacity({ size: worst.sq, conductor: 'Cu', insulation, installation: 'conduit' });
      ampacity = r.corrected * parallel;
      sourceKey = `KEC Cu_${insulation}_conduit ${worst.sq}sq${parallel > 1 ? ` ×${parallel}조` : ''}`;
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
    // 무발명 시정 제안: 케이블을 트립 견디는 최소 KEC 굵기로 상향(표 역산), 또는
    // 차단기 트립을 케이블 허용전류 이내 최대 표준값으로 하향(정격 사다리). 같은
    // 공사방법(관로)으로 역산해 허용전류를 비교 가능하게 맞춘다.
    const cableProposal: ReviewProposalOption[] = [];
    const cableUp = smallestCableFor(tripA, insulation, 'conduit', parallel);
    if (cableUp && cableUp.sq > worst.sq) {
      cableProposal.push({
        action: `케이블을 ${cableUp.sq}sq 이상으로 (허용전류 ${cableUp.ampacity}A ≥ 트립 ${tripA}A${parallel > 1 ? `·${parallel}조` : ''})`,
        basis: `KEC 허용전류표 Cu_${insulation}_conduit`,
      });
    }
    const tripDownToCable = largestTripAtMost(ampacity);
    if (tripDownToCable !== null) {
      cableProposal.push({
        action: `차단기 트립을 ${tripDownToCable}AT 이하로 (케이블 허용전류 ${ampacity}A 이내)`,
        basis: `${IEC_TRIP_SOURCE} + KEC 허용전류`,
      });
    }
    const cableProposalField =
      cableProposal.length > 0 ? { proposal: cableProposal } : {};
    if (tripA > ampacity) {
      findings.push({
        ...base,
        severity: 'FAIL',
        verdict: `차단기 ${tripA}A > 케이블 허용전류 ${ampacity}A — 케이블이 차단기보다 먼저 위험 (가정: 공사방법 관로·주위 30°C)`,
        ...cableProposalField,
      });
    } else if (tripA > ampacity * 0.8) {
      findings.push({
        ...base,
        severity: 'WARN',
        verdict: `차단기 ${tripA}A가 허용전류 ${ampacity}A의 80%를 초과 — 여유 부족 (가정: 관로·30°C)`,
        ...cableProposalField,
      });
    } else {
      // FAIL/WARN은 집합 보정이 더해져도 방향이 안 바뀌지만(더 나빠질 뿐),
      // PASS는 다회로 동일 관로에서 뒤집힐 수 있다 — 가정 전제를 명시한다.
      findings.push({
        ...base,
        severity: 'PASS',
        verdict: `차단기 ${tripA}A ≤ 허용전류 ${ampacity}A — 부합 (가정: 단독 회로·관로·30°C — 다회로 동일 관로면 집합 보정으로 낮아질 수 있어 재확인 대상)`,
      });
    }
  }

  // ── 규칙 3: TR 정격 2차전류 vs 페이지 최대 차단기 (정보 제공 — WARN까지만) ──
  // 2차전압이 같은 라벨에 무모호하게 적힌 TR만 계산한다. TR 라벨 관례:
  // 2차전압 추출 — 상간(선간) 전압을 쓴다. 3φ 정격 2차전류는 I₂=kVA/(√3·V_LL)라
  // V_LL(380)이 기준이지 상전압(220)이 아니다. "380/220V" 쌍은 선간/상전압이므로
  // 큰 값(380)이 선간이다(버그 사냥 F4 실측: 구 정규식이 슬래시 뒤 220을 잡아
  // 기준값 1.73배 과대). "6.6kV/380V"는 1·2차라 쌍 정규식(3~4자리 V 쌍)에 안
  // 걸리고 단독 380V로 떨어진다.
  const secondaryVoltage = (label: string): number | null => {
    const pair = label.match(/(\d{3,4})\s*[-/]\s*(\d{3,4})\s*V\b/i);
    if (pair) return Math.max(parseInt(pair[1], 10), parseInt(pair[2], 10));
    const single = label.match(/(?:^|[\s/])(\d{3,4})\s*V\b/i);
    return single ? parseInt(single[1], 10) : null;
  };
  const transformers = analysis.components.filter((c) => c.type === 'transformer');
  let bareTransformers = 0;
  for (const tr of transformers) {
    const spec = deriveSpec(tr);
    // 단위별 kVA 환산(버그 사냥 F8 수리): 구 `/VA$/`는 bare "VA"·"kVAR"도 통과시켜
    // "500VA"를 500kVA(1000배)로, 무효전력 kVAR를 유효용량으로 취급했다. 용량 단위는
    // kVA/MVA만 인정하고 각 배수로 환산한다(VA→계량 오류·kVAR→무효는 정격 아님).
    const unitU = (spec.powerUnit ?? '').toUpperCase();
    const kvaScale = unitU === 'KVA' ? 1 : unitU === 'MVA' ? 1000 : null;
    const hasKva = spec.power !== undefined && kvaScale !== null;
    const labelAll = [tr.label, tr.rating, tr.properties?.load].filter(Boolean).join(' ');
    const v2parsed = secondaryVoltage(labelAll);
    const secM = v2parsed !== null;
    // 수치 증거가 전혀 없는 bare 심볼(라벨 "TR"뿐)은 항목별 UNKNOWN을 만들지
    // 않는다 — 실측(수변전 p5)에서 TR 심볼 에코 8건이 UNKNOWN 소음으로 신호를
    // 희석했다. 존재 자체는 DATA-GAP 집계에 싣는다(은폐 아님·압축).
    if (!hasKva && !secM) {
      bareTransformers += 1;
      continue;
    }
    // 상수(단상/3상)는 산식을 √3배 가른다 — 도면 표기에서만 읽고, 미기재면
    // 계산하지 않는다(적대 검증 실측: 단상 10kVA/220V를 3상 산식으로 26.2A
    // 과소평가 — false 근거). 국내 표기 관례: 3φ·3∅·3상 / 1φ·1∅·단상.
    const phase3 = /3\s*[φ∅Φ]|3\s*상|three/i.test(labelAll);
    const phase1 = /1\s*[φ∅Φ]|단상|single/i.test(labelAll);
    if (!hasKva || !secM || (!phase3 && !phase1)) {
      findings.push({
        rule: 'TR-MAIN-CURRENT',
        severity: 'UNKNOWN',
        subject: subjectOf(tr),
        componentId: tr.id,
        given: { rating: tr.rating ?? '(미파싱)', label: tr.label ?? '' },
        verdict: !hasKva || !secM
          ? '용량 또는 2차전압이 무모호하게 파싱되지 않아 2차전류 판정 보류(무발명)'
          : '상수(1φ/3φ)가 도면에 없어 2차전류 산식을 정할 수 없음 — 판정 보류(무발명)',
      });
      continue;
    }
    const kva = (spec.power as number) * (kvaScale as number);
    const v2 = v2parsed as number;
    const i2 = phase3 ? (kva * 1000) / (Math.sqrt(3) * v2) : (kva * 1000) / v2;
    const formula = phase3 ? 'I₂ = kVA×1000/(√3×V₂)' : 'I₂ = kVA×1000/V₂ (단상)';
    findings.push({
      rule: 'TR-MAIN-CURRENT',
      severity: 'INFO',
      subject: subjectOf(tr),
      componentId: tr.id,
      given: { rating: `${kva}kVA`, secondary: `${v2}V`, phase: phase3 ? '3φ' : '1φ' },
      computed: { '정격 2차전류': `${Math.round(i2)}A` },
      limit: { value: `${Math.round(i2)}A`, source: formula },
      verdict: `정격 2차전류 ${Math.round(i2)}A — 2차 주차단기 선정 대조 기준값(계산 참고·부합 판정 아님)`,
    });
  }

  // ── 규칙 4: 판정 불가의 정직 집계 (무발명 원칙의 잔여 선언) ──
  const gapCable = breakers.length - breakersWithCable;
  const gapRating = breakers.length - ratedParsed;
  if ((breakers.length > 0 && (gapCable > 0 || gapRating > 0)) || bareTransformers > 0) {
    const given: Record<string, string> = {};
    if (breakers.length > 0) {
      given['케이블 미결속 차단기'] = `${gapCable}/${breakers.length}`;
      given['정격(AF/AT) 미파싱 차단기'] = `${gapRating}/${breakers.length}`;
    }
    if (bareTransformers > 0) {
      given['수치 없는 TR 심볼'] = `${bareTransformers}/${transformers.length}`;
    }
    findings.push({
      rule: 'DATA-GAP',
      severity: 'UNKNOWN',
      subject: '페이지 전체',
      given,
      verdict:
        '이 회로들은 이 도면만으로 케이블 판정 불가 — 분기 케이블은 통상 간선 스케줄(표)에 있다(중급 교차 검토 대상)',
    });
  }

  const summary = { pass: 0, warn: 0, fail: 0, unknown: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === 'PASS') summary.pass += 1;
    else if (f.severity === 'WARN') summary.warn += 1;
    else if (f.severity === 'FAIL') summary.fail += 1;
    else if (f.severity === 'INFO') summary.info += 1;
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

// IDENTITY_SEAL: review/circuit-review | role=초급 단일도면 하이브리드 검토(계산+기준+결론+무발명 제안) | inputs=SLDAnalysis | outputs=ReviewReport(findings.proposal=표준/KEC 역산 후보)
