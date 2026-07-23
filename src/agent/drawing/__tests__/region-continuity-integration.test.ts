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
