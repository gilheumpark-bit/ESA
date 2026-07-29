import { planAnalysisRegions } from '../../vision/adaptive-regions';
import { planBoundaryContinuations } from '../../vision/boundary-continuation-planner';
import { stitchBoundaryLines } from '../boundary-line-stitcher';
import type { RawLineHit } from '../evidence-deduplicator';

describe('4x4 region continuity integration', () => {
  it('reassembles one whole-page conductor from four independently numbered regions', () => {
    const regions = planAnalysisRegions(1_600, 1_200, 16, 0.18, 0);
    const globalLine: RawLineHit = {
      localId: 'global-main', lineKind: 'power', path: [{ x: 100, y: 450 }, { x: 1_500, y: 450 }],
      junctions: [], crossovers: [], confidence: 0.98, pageIndex: 0, regionId: 'full-page', certainty: 'confirmed',
    };
    const plan = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [{ id: globalLine.localId, path: globalLine.path, lineKind: 'power', source: 'global-vision', confidence: 0.98, junctions: [] }],
    });
    const boundaries = [100, ...plan.continuations.map((item) => item.point.x), 1_500];
    const regionIds = ['P01-A05', 'P01-A06', 'P01-A07', 'P01-A08'];
    const localLines: RawLineHit[] = regionIds.map((regionDisplayId, index) => ({
      localId: `fragment-${index + 1}`,
      lineKind: 'power',
      path: [{ x: boundaries[index], y: 450 }, { x: boundaries[index + 1], y: 450 }],
      junctions: [], crossovers: [], confidence: 0.95, pageIndex: 0,
      regionId: regionDisplayId.toLowerCase(), regionDisplayId, certainty: 'confirmed',
      ...(index > 0 ? { startAnchorId: plan.continuations[index - 1].displayId } : {}),
      ...(index < plan.continuations.length ? { endAnchorId: plan.continuations[index].displayId } : {}),
    }));

    const result = stitchBoundaryLines({ continuations: plan.continuations, localLines, globalLines: [globalLine] });

    expect(plan.continuations.map((item) => item.displayId)).toEqual(['P01-C001', 'P01-C002', 'P01-C003']);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].path).toEqual([
      { x: 100, y: 450 }, { x: 400, y: 450 }, { x: 800, y: 450 }, { x: 1_200, y: 450 }, { x: 1_500, y: 450 },
    ]);
    expect(result.receipts).toHaveLength(3);
    expect(result.receipts.every((receipt) => receipt.status === 'merged')).toBe(true);
    expect(result.unresolvedEndpoints).toEqual([]);
  });
});

/**
 * **합쳐지는 것**만 보면 절반이다 — 합치면 안 되는데 합치는 쪽도 봐야 한다.
 *
 * 실측 2026-07-29(변이): `distance` 검사를 통째로 `true` 로 바꿔도
 * `src/agent/drawing` 224 개가 전부 초록이었다. 끝점이 경계에서 아무리 멀어도
 * 이어 붙일 수 있다는 뜻이고, 단선도에서는 **없는 전선이 생기는 것**이다.
 * (같은 변이를 adjacency·globalCorroboration 에 걸었을 때는 잡혔다 — 거리
 * 가드만 무방비였다.)
 *
 * 기본 허용 오차는 12 px(`boundary-line-stitcher.ts:27`). 그 밖의 조각은
 * merge 가 아니라 `hold` 로 남고 `unresolvedEndpoints` 에 올라와야 한다.
 */
describe('경계에서 먼 조각은 잇지 않는다', () => {
  function scenario(gapPx: number) {
    const regions = planAnalysisRegions(1_600, 1_200, 16, 0.18, 0);
    const globalLine: RawLineHit = {
      localId: 'global-main', lineKind: 'power', path: [{ x: 100, y: 450 }, { x: 1_500, y: 450 }],
      junctions: [], crossovers: [], confidence: 0.98, pageIndex: 0, regionId: 'full-page', certainty: 'confirmed',
    };
    const plan = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [{ id: globalLine.localId, path: globalLine.path, lineKind: 'power', source: 'global-vision', confidence: 0.98, junctions: [] }],
    });
    const boundaries = [100, ...plan.continuations.map((item) => item.point.x), 1_500];
    const regionIds = ['P01-A05', 'P01-A06', 'P01-A07', 'P01-A08'];
    // 첫 조각의 끝을 경계에서 gapPx 만큼 물러나게 해 틈을 만든다.
    const localLines: RawLineHit[] = regionIds.map((regionDisplayId, index) => ({
      localId: `fragment-${index + 1}`,
      lineKind: 'power',
      path: [
        { x: boundaries[index], y: 450 },
        { x: index === 0 ? boundaries[index + 1] - gapPx : boundaries[index + 1], y: 450 },
      ],
      junctions: [], crossovers: [], confidence: 0.95, pageIndex: 0,
      regionId: regionDisplayId.toLowerCase(), regionDisplayId, certainty: 'confirmed',
      ...(index > 0 ? { startAnchorId: plan.continuations[index - 1].displayId } : {}),
      ...(index < plan.continuations.length ? { endAnchorId: plan.continuations[index].displayId } : {}),
    }));
    return stitchBoundaryLines({ continuations: plan.continuations, localLines, globalLines: [globalLine] });
  }

  it('허용 오차(12px) 안의 틈은 잇는다 — 과차단 반증', () => {
    const result = scenario(6);
    expect(result.receipts.filter((r) => r.status === 'merged')).toHaveLength(3);
    expect(result.unresolvedEndpoints).toEqual([]);
  });

  it('허용 오차를 넘는 틈은 잇지 않고 미해결로 남긴다', () => {
    const result = scenario(80);
    const first = result.receipts[0];
    expect(first.status).toBe('hold');
    expect(first.checks.distance).toBe(false);
    // 나머지 검사는 통과해야 한다 — 거리 하나로 막혔다는 뜻.
    expect(first.checks.adjacency).toBe(true);
    expect(first.checks.cardinality).toBe(true);
    expect(result.unresolvedEndpoints.length).toBeGreaterThan(0);
  });

  it('막힌 이음매만큼 전선이 하나로 합쳐지지 않는다', () => {
    expect(scenario(6).lines).toHaveLength(1);
    expect(scenario(80).lines.length).toBeGreaterThan(1);
  });
});
