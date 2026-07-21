import {
  buildCoverageLedger,
  createCoverageRegions,
  recordRoleCall,
} from '../coverage-ledger';

describe('coverage ledger', () => {
  it('keeps a region failed when one required role fails and later roles succeed', () => {
    let regions = createCoverageRegions([{
      regionId: 'p0-r0',
      pageIndex: 0,
      kind: 'grid',
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      requiredRoles: ['symbols', 'connections', 'text'],
    }]);

    regions = recordRoleCall(regions, 'p0-r0', 'symbols', 'call-symbols', false, 'timeout');
    regions = recordRoleCall(regions, 'p0-r0', 'connections', 'call-lines', true);
    regions = recordRoleCall(regions, 'p0-r0', 'text', 'call-text', true);

    const ledger = buildCoverageLedger(regions, ['connections', 'text'], 0);
    expect(ledger.regions[0].status).toBe('failed');
    expect(ledger.regionsFailed).toBe(1);
    expect(ledger.allPlannedFinished).toBe(true);
  });

  it('marks a region complete only when every required role has a successful receipt', () => {
    let regions = createCoverageRegions([{
      regionId: 'p0-r0',
      pageIndex: 0,
      kind: 'grid',
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      requiredRoles: ['symbols', 'connections', 'text'],
    }]);
    regions = recordRoleCall(regions, 'p0-r0', 'symbols', 'call-symbols', true);
    regions = recordRoleCall(regions, 'p0-r0', 'connections', 'call-lines', true);
    regions = recordRoleCall(regions, 'p0-r0', 'text', 'call-text', true);

    const ledger = buildCoverageLedger(regions, ['symbols', 'connections', 'text'], 0);
    expect(ledger.regions[0].status).toBe('complete');
    expect(ledger.regionsComplete).toBe(1);
    expect(ledger.allPlannedFinished).toBe(true);
  });
});
