/**
 * 초급 검토 사슬 — known-answer 반증 테스트
 *
 * 판정 로직이 대상이다. 허용전류 표 자체는 상류(47개 accuracy 테스트·IEC/KEC
 * 대조)에서 이미 검증됐으므로 여기서는 신뢰 오라클로 쓴다. TR 2차전류는
 * 표와 무관한 산식이라 독립 손계산 값으로 박는다.
 */

import { reviewAnalysis } from '../circuit-review';
import { getAmpacity } from '@/data/ampacity-tables/kec-ampacity';
import type { SLDAnalysis, SLDComponent, SLDConnection } from '@/lib/sld-recognition';

function analysisOf(components: SLDComponent[], connections: SLDConnection[] = []): SLDAnalysis {
  return {
    components, connections,
    suggestedCalculations: [], confidence: 0.85, rawDescription: 'test',
  };
}

const pos = { x: 0, y: 0 };

describe('AT-LE-AF — 트립은 프레임을 넘을 수 없다', () => {
  it('KIMM 실측 표기 100AF/75AT는 위반이 아니다', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'MCCB 3P-100/75', rating: '100AF/75AT', position: pos },
    ]));
    expect(r.findings.filter((f) => f.rule === 'AT-LE-AF')).toHaveLength(0);
  });

  it('트립>프레임(50AF/100AT)은 FAIL', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'MCCB', rating: '50AF/100AT', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'AT-LE-AF');
    expect(f?.severity).toBe('FAIL');
    expect(f?.verdict).toContain('100AT');
  });

  it('정격 미파싱 차단기는 이 규칙을 건너뛰고 커버리지에 잡힌다', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'VCB(DRAW OUT)', position: pos },
    ]));
    expect(r.findings.filter((f) => f.rule === 'AT-LE-AF')).toHaveLength(0);
    expect(r.coverage.breakersRatedParsed).toBe(0);
    expect(r.coverage.breakersTotal).toBe(1);
  });
});

describe('CABLE-AMPACITY — 차단기 AT vs KEC 허용전류', () => {
  const breaker = (rating: string): SLDComponent =>
    ({ id: 'comp_1', type: 'breaker', label: 'MCCB', rating, position: pos });
  const cableConn = (sq: string, cableType?: string): SLDConnection =>
    ({ id: 'conn_1', from: 'comp_1', to: 'node_at_10_10', conductorSize: sq, cableType });

  it('여유 충분(트립 ≤ 80%)은 PASS — 4sq XLPE 관로 기준', () => {
    const amp = getAmpacity({ size: 4, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const safeTrip = Math.floor(amp * 0.5);
    const r = reviewAnalysis(analysisOf([breaker(`50AF/${safeTrip}AT`)], [cableConn('4sq', 'CV')]));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('PASS');
    expect(f?.limit?.source).toContain('KEC');
  });

  it('트립이 허용전류 초과면 FAIL — false-PASS 금지의 핵심', () => {
    const amp = getAmpacity({ size: 4, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const overTrip = Math.ceil(amp) + 10;
    const r = reviewAnalysis(analysisOf([breaker(`225AF/${overTrip}AT`)], [cableConn('4sq', 'CV')]));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('FAIL');
    expect(f?.verdict).toContain('허용전류');
  });

  it('80% 초과~100%는 WARN(여유 부족)', () => {
    const amp = getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const nearTrip = Math.floor(amp * 0.9);
    const r = reviewAnalysis(analysisOf([breaker(`225AF/${nearTrip}AT`)], [cableConn('25sq', 'FR-CV')]));
    expect(r.findings.find((x) => x.rule === 'CABLE-AMPACITY')?.severity).toBe('WARN');
  });

  it('PVC 계열(HIV)은 XLPE보다 낮은 허용전류로 판정한다', () => {
    const xlpe = getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const pvc = getAmpacity({ size: 25, conductor: 'Cu', insulation: 'PVC', installation: 'conduit' }).corrected;
    expect(pvc).toBeLessThan(xlpe);
    const trip = Math.floor((pvc + xlpe) / 2); // PVC로는 초과, XLPE로는 통과인 트립
    const r = reviewAnalysis(analysisOf([breaker(`225AF/${trip}AT`)], [cableConn('25sq', 'HIV')]));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(['FAIL', 'WARN']).toContain(f?.severity); // PVC 기준으로 판정됐다는 증거
    expect(f?.limit?.source).toContain('PVC');
  });

  it('KEC 비표준 굵기는 판정하지 않고 UNKNOWN(무발명)', () => {
    const r = reviewAnalysis(analysisOf([breaker('50AF/20AT')], [cableConn('7sq', 'CV')]));
    expect(r.findings.find((x) => x.rule === 'CABLE-AMPACITY')?.severity).toBe('UNKNOWN');
  });

  it('병렬 다조는 포설배치·집합회로 수가 없으면 명목합계만 제시하고 판정을 보류한다', () => {
    const amp1 = getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    // 단조로는 초과지만 2조 명목합계 이내다. 병렬 조수만으로 집합보정계수를
    // 발명할 수 없으므로 PASS/FAIL 대신 필요한 입력을 요구해야 한다.
    const trip = Math.floor(amp1 * 1.4);
    const conn: SLDConnection = { id: 'conn_1', from: 'comp_1', to: 'node_at_10_10', conductorSize: '25sq', cableType: 'FR-CV', parallelCount: 2 };
    const r = reviewAnalysis(analysisOf([breaker(`400AF/${trip}AT`)], [conn]));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('UNKNOWN');
    expect(f?.limit?.source).toContain('집합·배치 미반영');
    expect(f?.verdict).toContain('포설배치');
  });

  it('병렬 조수를 집합회로 수로 오인해 0.80을 자동 적용하지 않는다', () => {
    const single = getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    // 트립을 임의 0.80 보정치(1.6×)와 명목합계(2.0×) 사이에 둔다.
    // 포설조건이 없으므로 어느 쪽도 확정하지 않고 UNKNOWN이어야 한다.
    const trip = Math.round(single * 1.8);
    const conn: SLDConnection = { id: 'conn_1', from: 'comp_1', to: 'node_at_10_10', conductorSize: '25sq', cableType: 'FR-CV', parallelCount: 2 };
    const r = reviewAnalysis(analysisOf([breaker(`400AF/${trip}AT`)], [conn]));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('UNKNOWN');
    expect(f?.limit?.source).not.toContain('집합보정 적용');
  });

  it('병렬 케이블의 집합보정 전 명목합계조차 초과하면 확정 FAIL이다', () => {
    const single = getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const trip = Math.ceil(single * 2) + 1;
    const conn: SLDConnection = { id: 'conn_1', from: 'comp_1', to: 'node_at_10_10', conductorSize: '25sq', cableType: 'FR-CV', parallelCount: 2 };
    const r = reviewAnalysis(analysisOf([breaker(`400AF/${trip}AT`)], [conn]));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('FAIL');
    expect(f?.verdict).toContain('명목 합계');
  });

  it('복수 케이블 결속 시 가장 가는 것이 병목', () => {
    const amp4 = getAmpacity({ size: 4, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const overFor4 = Math.ceil(amp4) + 5;
    const r = reviewAnalysis(analysisOf(
      [breaker(`225AF/${overFor4}AT`)],
      [cableConn('95sq', 'CV'), { id: 'conn_2', from: 'node_at_5_5', to: 'comp_1', conductorSize: '4sq', cableType: 'CV' }],
    ));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('FAIL');
    expect(f?.given.cable).toContain('4sq');
  });
});

describe('TR-MAIN-CURRENT — 정격 2차전류 (독립 손계산 known-answer)', () => {
  it('3φ 1000kVA·380V → 1519A (kVA×1000/(√3×380) = 1519.34…) · INFO(부합 판정 아님)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'MOLD TR-3 3∅ 6.6KV/380V', rating: '1000kVA', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT');
    expect(f?.severity).toBe('INFO');
    expect(f?.computed?.['정격 2차전류']).toBe('1519A');
    expect(r.summary.info).toBe(1);
    expect(r.summary.pass).toBe(0); // 정보 제공이 부합으로 계수되면 안 된다
  });

  it('3φ 500kVA·220V → 1312A', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'MOLD TR-1 3φ 6.6KV/220V', rating: '500kVA', position: pos },
    ]));
    expect(r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT')?.computed?.['정격 2차전류']).toBe('1312A');
  });

  it('단상 10kVA·220V → 45A — 3상 산식(26A) 과소평가 방지 (적대 검증 실측 수리)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: '단상 TR 220V', rating: '10kVA', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT');
    expect(f?.severity).toBe('INFO');
    expect(f?.computed?.['정격 2차전류']).toBe('45A');
    expect(f?.limit?.source).toContain('단상');
  });

  it('3φ 380/220V 쌍은 상간 380을 쓴다 — 슬래시 뒤 220(1519→2624 오차) 방지 (F4 수리)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'TR 3φ 380/220V', rating: '1000kVA', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT');
    expect(f?.given.secondary).toBe('380V');
    expect(f?.computed?.['정격 2차전류']).toBe('1519A');
  });

  it('상수(1φ/3φ) 미기재면 계산하지 않고 UNKNOWN(무발명)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'TR 6.6KV/380V', rating: '1000kVA', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT');
    expect(f?.severity).toBe('UNKNOWN');
    expect(f?.verdict).toContain('상수');
  });

  it('2차전압이 무모호하지 않으면 계산하지 않고 UNKNOWN(무발명)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'TR', rating: '1000kVA', position: pos },
    ]));
    expect(r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT')?.severity).toBe('UNKNOWN');
  });

  it('bare "500VA"를 500kVA(1000배)로 취급하지 않는다 (F8)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'TR 1φ 500VA 220V', rating: '', position: pos },
    ]));
    // VA는 용량 단위로 인정 안 함 → 계산 보류(UNKNOWN), 2273A 같은 발명 없음
    const f = r.findings.find((x) => x.rule === 'TR-MAIN-CURRENT');
    expect(f?.severity).not.toBe('INFO');
  });

  it('수치 없는 bare TR 심볼은 항목별 UNKNOWN 대신 DATA-GAP에 압축된다(신호 희석 방지)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'transformer', label: 'TR', position: pos },
      { id: 'comp_2', type: 'transformer', label: 'TR', position: pos },
    ]));
    expect(r.findings.filter((x) => x.rule === 'TR-MAIN-CURRENT')).toHaveLength(0);
    const gap = r.findings.find((x) => x.rule === 'DATA-GAP');
    expect(gap?.given['수치 없는 TR 심볼']).toBe('2/2');
  });
});

describe('DATA-GAP — 판정 불가의 정직 집계', () => {
  it('케이블 미결속·정격 미파싱을 숨기지 않고 센다', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'MCCB 3P-100/75', rating: '100AF/75AT', position: pos },
      { id: 'comp_2', type: 'breaker', label: 'VCB(DRAW OUT)', position: pos },
    ]));
    const gap = r.findings.find((x) => x.rule === 'DATA-GAP');
    expect(gap?.severity).toBe('UNKNOWN');
    expect(gap?.given['케이블 미결속 차단기']).toBe('2/2');
    expect(gap?.given['정격(AF/AT) 미파싱 차단기']).toBe('1/2');
  });

  it('차단기 0대 페이지는 GAP 자체를 만들지 않는다', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'meter', label: 'DIGITAL METER', position: pos },
    ]));
    expect(r.findings.filter((x) => x.rule === 'DATA-GAP')).toHaveLength(0);
  });
});

describe('무발명 시정 제안 — 표준/KEC 역산 후보만(지어냄 금지)', () => {
  it('AT>AF FAIL은 표준 정격 역산 제안을 단다 (100AF/150AT → 트립 100AT↓·프레임 160AF↑)', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'MCCB', rating: '100AF/150AT', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'AT-LE-AF');
    expect(f?.proposal).toBeDefined();
    const actions = (f?.proposal ?? []).map((p) => p.action).join(' | ');
    expect(actions).toContain('100AT'); // 프레임 100AF 유지 시 트립 하향(largestTripAtMost(100))
    expect(actions).toContain('160AF'); // 트립 150AT 유지 시 프레임 상향(smallestFrameFor(150))
    expect((f?.proposal ?? []).every((p) => /IEC/.test(p.basis))).toBe(true);
  });

  it('케이블 초과 FAIL은 KEC 굵기 상향 + 트립 하향 제안을 단다', () => {
    const amp4 = getAmpacity({ size: 4, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const overTrip = Math.ceil(amp4) + 10;
    const r = reviewAnalysis(analysisOf(
      [{ id: 'comp_1', type: 'breaker', label: 'MCCB', rating: `225AF/${overTrip}AT`, position: pos }],
      [{ id: 'conn_1', from: 'comp_1', to: 'node_at_10_10', conductorSize: '4sq', cableType: 'CV' }],
    ));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('FAIL');
    const cableOpt = f?.proposal?.find((p) => /KEC/.test(p.basis));
    expect(cableOpt).toBeDefined();                 // 케이블 상향 후보(KEC 표 역산)
    expect(cableOpt?.action).toMatch(/\d+sq 이상/);   // 표준 굵기값이 명시됨
    expect(f?.proposal?.some((p) => /트립.*이하/.test(p.action))).toBe(true); // 트립 하향 후보
  });

  it('표준 사다리 밖이면 그 후보를 만들지 않는다(발명 대신 보류) — 1600AF/2000AT는 프레임 상향 없음', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'MCCB', rating: '1600AF/2000AT', position: pos },
    ]));
    const f = r.findings.find((x) => x.rule === 'AT-LE-AF');
    expect(f?.severity).toBe('FAIL');
    const actions = (f?.proposal ?? []).map((p) => p.action).join(' | ');
    expect(actions).toContain('1600AT');       // 트립 하향은 사다리 안(largestTripAtMost(1600)=1600)
    expect(actions).not.toContain('프레임을');  // 프레임 상향 후보 없음(2000 > 최대 프레임 1600·발명 금지)
  });

  it('케이블 여유 충분(PASS)에는 제안이 붙지 않는다', () => {
    const amp = getAmpacity({ size: 4, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' }).corrected;
    const safeTrip = Math.floor(amp * 0.5);
    const r = reviewAnalysis(analysisOf(
      [{ id: 'comp_1', type: 'breaker', label: 'MCCB', rating: `50AF/${safeTrip}AT`, position: pos }],
      [{ id: 'conn_1', from: 'comp_1', to: 'node_at_10_10', conductorSize: '4sq', cableType: 'CV' }],
    ));
    const f = r.findings.find((x) => x.rule === 'CABLE-AMPACITY');
    expect(f?.severity).toBe('PASS');
    expect(f?.proposal).toBeUndefined();
  });
});

describe('리포트 계약', () => {
  it('summary 집계와 disclaimer가 항상 실린다', () => {
    const r = reviewAnalysis(analysisOf([
      { id: 'comp_1', type: 'breaker', label: 'MCCB', rating: '50AF/100AT', position: pos },
    ]));
    expect(r.summary.fail).toBeGreaterThanOrEqual(1);
    expect(r.disclaimer).toContain('유자격');
  });
});
