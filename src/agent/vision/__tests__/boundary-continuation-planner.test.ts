import { planAnalysisRegions } from '../adaptive-regions';
import { planBoundaryContinuations } from '../boundary-continuation-planner';
import type { GlobalLineCandidate } from '../continuity-types';

const regions = planAnalysisRegions(1600, 1200, 16, 0.18, 0);

function line(
  id: string,
  path: Array<{ x: number; y: number }>,
  lineKind: GlobalLineCandidate['lineKind'] = 'power',
): GlobalLineCandidate {
  return { id, path, lineKind, source: 'global-vision', confidence: 0.95, junctions: [] };
}

describe('boundary continuation planner', () => {
  it('assigns the same stable C port to both regions at every logical seam crossing', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('main', [{ x: 100, y: 450 }, { x: 1500, y: 450 }])],
    });

    expect(result.continuations.map((item) => item.displayId)).toEqual([
      'P01-C001',
      'P01-C002',
      'P01-C003',
    ]);
    expect(result.continuations.map((item) => item.observations.map((observation) => observation.regionDisplayId)))
      .toEqual([
        ['P01-A05', 'P01-A06'],
        ['P01-A06', 'P01-A07'],
        ['P01-A07', 'P01-A08'],
      ]);
    expect(result.continuations.every((item) => item.observations.length === 2)).toBe(true);
  });

  it('keeps close parallel conductors as distinct C port sequences', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [
        line('parallel-a', [{ x: 100, y: 710 }, { x: 1500, y: 710 }]),
        line('parallel-b', [{ x: 100, y: 725 }, { x: 1500, y: 725 }]),
      ],
    });

    expect(result.continuations).toHaveLength(6);
    expect(result.continuations.filter((item) => item.sourceLineId === 'parallel-a')).toHaveLength(3);
    expect(result.continuations.filter((item) => item.sourceLineId === 'parallel-b')).toHaveLength(3);
    expect(new Set(result.continuations.map((item) => item.id)).size).toBe(6);
  });

  it('groups vertical and horizontal seams at a grid corner without duplicating the port', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('diagonal', [{ x: 0, y: 0 }, { x: 1600, y: 1200 }])],
    });

    expect(result.continuations).toHaveLength(3);
    expect(result.continuations.map((item) => item.seams)).toEqual([
      [{ orientation: 'vertical', index: 1 }, { orientation: 'horizontal', index: 1 }],
      [{ orientation: 'vertical', index: 2 }, { orientation: 'horizontal', index: 2 }],
      [{ orientation: 'vertical', index: 3 }, { orientation: 'horizontal', index: 3 }],
    ]);
    expect(result.continuations[0].observations.map((item) => item.regionDisplayId))
      .toEqual(['P01-A01', 'P01-A06']);
  });

  it('does not create crossing ports for a conductor that lies along a seam', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('seam-line', [{ x: 400, y: 100 }, { x: 400, y: 1100 }])],
    });

    expect(result.continuations).toEqual([]);
    expect(result.seamAlignedLineIds).toEqual(['seam-line']);
  });

  it('creates one port when a polyline crosses through a vertex exactly on the seam', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('vertex-crossing', [
        { x: 100, y: 150 },
        { x: 400, y: 150 },
        { x: 700, y: 150 },
      ])],
    });

    expect(result.continuations).toHaveLength(1);
    expect(result.continuations[0]).toMatchObject({
      displayId: 'P01-C001',
      point: { x: 400, y: 150 },
      sourceLineId: 'vertex-crossing',
    });
    expect(result.continuations[0].observations.map((item) => item.regionDisplayId))
      .toEqual(['P01-A01', 'P01-A02']);
  });

  it('keeps valid later crossings when an earlier segment lies along a seam', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('partly-aligned', [
        { x: 400, y: 100 },
        { x: 400, y: 450 },
        { x: 800, y: 450 },
        { x: 1200, y: 450 },
        { x: 1500, y: 450 },
      ])],
    });

    expect(result.continuations.map((item) => item.point)).toEqual([
      { x: 800, y: 450 },
      { x: 1200, y: 450 },
    ]);
    expect(result.seamAlignedLineIds).toEqual([]);
  });

  it('does not create a port when a vertex merely touches a seam and returns to the same side', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('touch-only', [
        { x: 100, y: 150 },
        { x: 400, y: 150 },
        { x: 100, y: 200 },
      ])],
    });

    expect(result.continuations).toEqual([]);
  });

  it('does not cut a line through a device occupying the seam', () => {
    const result = planBoundaryContinuations({
      pageIndex: 0,
      regions,
      lines: [line('device-line', [{ x: 100, y: 450 }, { x: 1500, y: 450 }])],
      deviceBounds: [{ x: 380, y: 430, w: 40, h: 40 }],
    });

    expect(result.continuations.map((item) => item.point)).toEqual([
      { x: 800, y: 450 },
      { x: 1200, y: 450 },
    ]);
  });
});
