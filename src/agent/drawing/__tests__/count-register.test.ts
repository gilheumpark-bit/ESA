import { assignPhysicalEquipmentIds, buildEquipmentCounts } from '../count-register';
import type { SymbolNode } from '../types-v3';

function sym(partial: Partial<SymbolNode> & { id: string; displayId: string }): SymbolNode {
  return {
    typeCandidates: ['vcb'],
    certainty: 'confirmed',
    evidence: [{
      evidenceId: `${partial.id}-e`,
      pageIndex: 0,
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      confidence: 1,
    }],
    ...partial,
  };
}

describe('count-register', () => {
  it('separates symbolOccurrences from physicalEquipmentCount', () => {
    const symbols = [
      sym({ id: 'a', displayId: 'P01-S001', confirmedType: 'vcb', certainty: 'confirmed' }),
      sym({ id: 'b', displayId: 'P02-S001', confirmedType: 'vcb', certainty: 'confirmed' }),
      sym({ id: 'c', displayId: 'P01-S002', confirmedType: 'vcb', certainty: 'ambiguous' }),
    ];
    const links = assignPhysicalEquipmentIds(symbols, [{
      id: 'xr1',
      displayId: 'XR001',
      fromPage: 0,
      toPage: 1,
      fromRef: 'a',
      toRef: 'b',
      status: 'confirmed',
      evidence: [],
    }]);
    const rows = buildEquipmentCounts(symbols, links, [], []);
    const vcb = rows.find((r) => r.equipmentKind.includes('VCB') || r.equipmentKind.includes('breaker'));
    expect(vcb).toBeDefined();
    expect(vcb!.symbolOccurrences).toBe(3);
    expect(vcb!.confirmed).toBe(2);
    expect(vcb!.ambiguous).toBe(1);
    expect(vcb!.physicalEquipmentCount).toBe(1); // merged a+b
    expect(vcb!.countStatus).toBe('CONDITIONAL');
  });

  it('never puts ambiguous into confirmed', () => {
    const symbols = [
      sym({ id: 'x', displayId: 'P01-S001', confirmedType: 'pt', certainty: 'ambiguous', typeCandidates: ['pt'] }),
    ];
    const rows = buildEquipmentCounts(symbols, new Map(), [], []);
    const row = rows[0];
    expect(row.confirmed).toBe(0);
    expect(row.ambiguous).toBe(1);
    expect(row.physicalEquipmentCount).toBeNull();
  });
});
