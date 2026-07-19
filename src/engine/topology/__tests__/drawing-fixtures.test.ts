/**
 * 도면 픽스처 회귀 테스트
 * ───────────────────────
 * 15장(초5·중5·고5)을 파서에 통과시키고 정답 라벨과 대조한다.
 *
 * 임계값은 발명하지 않았다 — 1차 전수 측정(docs/DRAWING_VALIDATION_RESULT.md)에서
 * 나온 실측값을 바닥으로 삼아 잠근다. 즉 여기의 숫자는 "이 정도면 좋다"가 아니라
 * "여기서 더 나빠지면 회귀"라는 뜻이다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDxfToSLD } from '../dxf-parser';
import { compareToLabel, type DrawingLabel } from '../fixture-metrics';

const FIXTURE_DIR = join(process.cwd(), 'fixtures', 'drawings', 'synthetic');

function loadFixtures(): Array<{ label: DrawingLabel; dxf: string }> {
  const labelFiles = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.label.json'));
  return labelFiles.map((lf) => {
    const label = JSON.parse(readFileSync(join(FIXTURE_DIR, lf), 'utf8')) as DrawingLabel;
    const dxf = readFileSync(join(FIXTURE_DIR, `${label.id}.dxf`), 'utf8');
    return { label, dxf };
  });
}

const fixtures = loadFixtures();

/** 라벨 좌표는 도면 단위 그대로다. 파서는 unitScale로 길이만 환산하므로 좌표는 무변환. */
function parse(dxf: string) {
  return parseDxfToSLD(dxf);
}

describe('도면 픽스처 — 수확', () => {
  it('15장이 모두 존재한다', () => {
    expect(fixtures).toHaveLength(15);
    expect(fixtures.filter((f) => f.label.tier === '초')).toHaveLength(5);
    expect(fixtures.filter((f) => f.label.tier === '중')).toHaveLength(5);
    expect(fixtures.filter((f) => f.label.tier === '고')).toHaveLength(5);
  });

  it('모든 도면이 예외 없이 파싱된다', () => {
    for (const { label, dxf } of fixtures) {
      expect(() => parse(dxf)).not.toThrow();
      const parsed = parse(dxf);
      expect(parsed).toBeDefined();
      expect(Array.isArray(parsed.components)).toBe(true);
      // 빈 결과는 파싱 실패와 구분되지 않는다 — 최소 1개는 나와야 한다
      expect(parsed.components.length).toBeGreaterThan(0);
    }
  });
});

describe('도면 픽스처 — 정확도 바닥선', () => {
  // 바닥선은 발명하지 않았다. 수리 후 15장 전수 실측이 모든 지표 100%였고
  // (docs/DRAWING_VALIDATION_RESULT.md), 합성 도면은 정답이 확정적이므로
  // 100% 미만은 곧 회귀다. 실제 현장 도면이 들어오면 그쪽은 별도 바닥선을 갖는다
  // — 이 숫자를 그리로 옮기면 안 된다.
  const FLOOR: Record<string, { node: number; edge: number; type: number }> = {
    초: { node: 1.0, edge: 1.0, type: 1.0 },
    중: { node: 1.0, edge: 1.0, type: 1.0 },
    고: { node: 1.0, edge: 1.0, type: 1.0 },
  };

  for (const { label, dxf } of fixtures) {
    it(`${label.id} — 노드·결선·타입 바닥선 유지`, () => {
      const m = compareToLabel(label, parse(dxf));
      const floor = FLOOR[label.tier];

      expect(m.nodeRecall).toBeGreaterThanOrEqual(floor.node);
      expect(m.edgeRecall).toBeGreaterThanOrEqual(floor.edge);
      if (m.typeAccuracy !== null) {
        expect(m.typeAccuracy).toBeGreaterThanOrEqual(floor.type);
      }
    });
  }
});

describe('도면 픽스처 — 그래프 불변식', () => {
  for (const { label, dxf } of fixtures) {
    it(`${label.id} — 고아 0 · 허공 결선 0 · 자기루프 0`, () => {
      const m = compareToLabel(label, parse(dxf));
      expect(m.counts.danglingEdges).toBe(label.invariants.danglingEdges);
      expect(m.counts.selfLoops).toBe(label.invariants.selfLoops);
      expect(m.counts.orphans).toBe(label.invariants.orphanNodes);
    });
  }
});

describe('도면 픽스처 — 회귀 가드 (과거 실측 결함)', () => {
  it('LINE 결선이 추출된다 (vertices 필드 회귀 가드)', () => {
    const f = fixtures.find((x) => x.label.id === 'L1-01-basic-radial')!;
    const parsed = parse(f.dxf);
    expect(parsed.connections.length).toBeGreaterThan(0);
  });

  it('TEXT 정격이 심볼에 결합된다 (startPoint 필드 회귀 가드)', () => {
    const f = fixtures.find((x) => x.label.id === 'L1-02-text-spec')!;
    const m = compareToLabel(f.label, parse(f.dxf));
    expect(m.specRecall).toBe(1);
  });

  it('CIRCLE 심볼이 컴포넌트로 잡힌다 (center 필드 회귀 가드)', () => {
    const f = fixtures.find((x) => x.label.id === 'L1-03-circle-motor')!;
    const parsed = parse(f.dxf);
    const motors = parsed.components.filter((c) => c.type === 'motor');
    expect(motors.length).toBeGreaterThanOrEqual(2);
  });

  it('블록명 분류가 단일문자 키에 삼켜지지 않는다 (MCC·METER·SWGR·LIGHT)', () => {
    const f = fixtures.find((x) => x.label.id === 'L1-05-block-naming')!;
    const m = compareToLabel(f.label, parse(f.dxf));
    expect(m.typeAccuracy).toBe(1);
  });

  it('폴리라인 결선이 추출된다', () => {
    const f = fixtures.find((x) => x.label.id === 'L1-04-polyline-route')!;
    const m = compareToLabel(f.label, parse(f.dxf));
    expect(m.edgeRecall).toBe(1);
  });

  it('레이어 노이즈가 결선으로 오검출되지 않는다', () => {
    const f = fixtures.find((x) => x.label.id === 'L2-05-layer-noise')!;
    const m = compareToLabel(f.label, parse(f.dxf));
    // 노이즈 24줄 + 도면틀이 전부 결선이 되면 정밀도가 바닥난다
    expect(m.edgePrecision).toBeGreaterThanOrEqual(0.5);
  });
});
