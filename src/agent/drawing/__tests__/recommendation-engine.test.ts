import { buildRecommendations, hasRequiredLinks } from '../recommendation-engine';
import type { SymbolNode } from '../types-v3';

const mk = (id: string, type: string, certainty: 'confirmed' | 'ambiguous' = 'confirmed'): SymbolNode => ({
  id,
  displayId: id,
  typeCandidates: [type],
  confirmedType: type,
  certainty,
  evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }],
});

describe('recommendation-engine', () => {
  it('HOLDs breaker rating without inventing upsize', () => {
    const recs = buildRecommendations({
      symbols: [mk('P03-S012', 'vcb')],
      relations: [],
      calculations: [],
      unresolved: [],
    });
    const hold = recs.find((r) => r.status === 'HOLD' && r.problem.includes('P03-S012'));
    expect(hold).toBeDefined();
    expect(hold!.recommendedAction).toMatch(/부하전류/);
    expect(hold!.recommendedAction).not.toMatch(/증설하십시오/);
  });

  it('rejects SUPPORTED without evidence', () => {
    expect(hasRequiredLinks({
      id: 'x',
      severity: 'major',
      priority: 1,
      problem: 'x',
      relatedDisplayIds: [],
      evidenceIds: [],
      calcReceiptIds: [],
      standardRefs: ['KEC'],
      requiredInputs: [],
      recommendedAction: 'y',
      status: 'SUPPORTED',
    })).toBe(false);
  });

  it('flags power path without protection', () => {
    const recs = buildRecommendations({
      symbols: [mk('s1', 'generator'), mk('s2', 'load')],
      relations: [{
        id: 'r1',
        displayId: 'P01-R001',
        from: 's1',
        to: 's2',
        certainty: 'confirmed',
        evidence: [
          { evidenceId: 'e1', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, confidence: 1 },
        ],
      }],
      calculations: [],
      unresolved: [],
    });
    expect(recs.some((r) => r.problem.includes('보호기'))).toBe(true);
  });

  it('uses coverage evidence for an absent-ground finding and keeps unresolved topology as HOLD', () => {
    const recs = buildRecommendations({
      symbols: [mk('P01-S001', 'load')], relations: [], calculations: [],
      unresolved: [{ id: 'u1', code: 'LINE_CONTINUITY_UNCERTAIN', displayId: 'P01-L001', pageIndex: 0, bounds: { x: 0, y: 0, w: 20, h: 2 }, note: '종단 장치 미확정' }],
      hasGroundPath: false,
      coverageEvidenceIds: ['coverage-call-1'],
    });
    expect(recs).toEqual(expect.arrayContaining([
      expect.objectContaining({ problem: expect.stringContaining('접지 경로'), status: 'SUPPORTED', evidenceIds: expect.arrayContaining(['coverage-call-1']) }),
      expect.objectContaining({ problem: expect.stringContaining('P01-L001'), status: 'HOLD' }),
    ]));
  });
});
