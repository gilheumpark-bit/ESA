import { planAnalysisRegions, regionCoverageComplete, markRegion } from '../adaptive-regions';

describe('adaptive-regions', () => {
  it('plans grid with lifecycle and never claims complete while planned remains', () => {
    const regions = planAnalysisRegions({
      pageIndex: 0,
      width: 1000,
      height: 800,
      gridSize: 4,
      overlap: 0.1,
      addBusStrips: true,
    });
    expect(regions.length).toBeGreaterThanOrEqual(4);
    expect(regions.every((r) => r.status === 'planned' || r.status === 'skipped-empty')).toBe(true);
    expect(regionCoverageComplete(regions)).toBe(false);
    let next = regions;
    for (const r of regions) {
      if (r.status === 'planned') next = markRegion(next, r.regionId, 'complete');
    }
    expect(regionCoverageComplete(next)).toBe(true);
  });

  it('skips fully empty areas', () => {
    const regions = planAnalysisRegions({
      pageIndex: 0,
      width: 100,
      height: 100,
      gridSize: 4,
      overlap: 0,
      emptyAreas: [{ x: 0, y: 0, w: 100, h: 100 }],
    });
    expect(regions.every((r) => r.status === 'skipped-empty')).toBe(true);
  });
});
