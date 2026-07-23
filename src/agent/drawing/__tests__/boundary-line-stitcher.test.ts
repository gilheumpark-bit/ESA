import { stitchBoundaryLines } from '../boundary-line-stitcher';
import type { RawLineHit } from '../evidence-deduplicator';
import type { BoundaryContinuation } from '../../vision/continuity-types';

function continuation(
  displayId: string,
  point: { x: number; y: number },
  regions: [string, string],
  lineKind: BoundaryContinuation['lineKind'] = 'power',
): BoundaryContinuation {
  return {
    id: `id-${displayId}`,
    displayId,
    pageIndex: 0,
    point,
    seams: [{ orientation: 'vertical', index: 1 }],
    tangent: { x: 1, y: 0 },
    lineKind,
    sourceLineId: `global-${displayId}`,
    source: 'global-vision',
    status: 'planned',
    observations: regions.map((regionDisplayId, index) => ({
      regionId: regionDisplayId.toLowerCase(),
      regionDisplayId,
      side: index === 0 ? 'right' : 'left',
      point,
      tangent: { x: 1, y: 0 },
      confidence: 0.95,
    })),
  };
}

function localLine(input: {
  id: string;
  path: Array<{ x: number; y: number }>;
  regionDisplayId: string;
  lineKind?: RawLineHit['lineKind'];
  startAnchorId?: string;
  endAnchorId?: string;
}): RawLineHit {
  return {
    localId: input.id,
    lineKind: input.lineKind ?? 'power',
    path: input.path,
    junctions: [],
    crossovers: [],
    confidence: 0.95,
    pageIndex: 0,
    regionId: input.regionDisplayId.toLowerCase(),
    regionDisplayId: input.regionDisplayId,
    certainty: 'confirmed',
    startAnchorId: input.startAnchorId,
    endAnchorId: input.endAnchorId,
  };
}

function globalLine(id: string, path: Array<{ x: number; y: number }>): RawLineHit {
  return {
    localId: id,
    lineKind: 'power',
    path,
    junctions: [],
    crossovers: [],
    confidence: 0.95,
    pageIndex: 0,
    regionId: 'full-page',
    certainty: 'confirmed',
  };
}

describe('boundary line stitcher', () => {
  it('merges two adjacent fragments through one corroborated C port', () => {
    const port = continuation('P01-C001', { x: 50, y: 50 }, ['P01-A01', 'P01-A02']);
    const result = stitchBoundaryLines({
      continuations: [port],
      localLines: [
        localLine({ id: 'left', path: [{ x: 0, y: 50 }, { x: 50, y: 50 }], regionDisplayId: 'P01-A01', endAnchorId: port.displayId }),
        localLine({ id: 'right', path: [{ x: 50, y: 50 }, { x: 100, y: 50 }], regionDisplayId: 'P01-A02', startAnchorId: port.displayId }),
      ],
      globalLines: [globalLine(port.sourceLineId, [{ x: 0, y: 50 }, { x: 100, y: 50 }])],
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].path).toEqual([{ x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }]);
    expect(result.lines[0]).not.toHaveProperty('startAnchorId');
    expect(result.lines[0]).not.toHaveProperty('endAnchorId');
    expect(result.unresolvedEndpoints).toEqual([]);
    expect(result.receipts).toEqual([expect.objectContaining({ status: 'merged', continuationIds: ['P01-C001'] })]);
  });

  it('registers a numbered U endpoint when the opposite C fragment is missing', () => {
    const port = continuation('P01-C001', { x: 50, y: 50 }, ['P01-A01', 'P01-A02']);
    const result = stitchBoundaryLines({
      continuations: [port],
      localLines: [
        localLine({ id: 'left', path: [{ x: 0, y: 50 }, { x: 50, y: 50 }], regionDisplayId: 'P01-A01', endAnchorId: port.displayId }),
      ],
      globalLines: [globalLine(port.sourceLineId, [{ x: 0, y: 50 }, { x: 100, y: 50 }])],
    });

    expect(result.lines).toHaveLength(1);
    expect(result.unresolvedEndpoints).toEqual([
      expect.objectContaining({ displayId: 'P01-U001', reason: 'UNPAIRED_CONTINUATION', continuationId: 'P01-C001' }),
    ]);
    expect(result.receipts[0]).toMatchObject({ status: 'hold', checks: { cardinality: false } });
  });

  it.each([
    ['TANGENT_MISMATCH', localLine({ id: 'right', path: [{ x: 50, y: 50 }, { x: 50, y: 100 }], regionDisplayId: 'P01-A02', startAnchorId: 'P01-C001' })],
    ['LINE_KIND_MISMATCH', localLine({ id: 'right', path: [{ x: 50, y: 50 }, { x: 100, y: 50 }], regionDisplayId: 'P01-A02', lineKind: 'ground', startAnchorId: 'P01-C001' })],
  ])('holds rather than merging on %s', (reason, right) => {
    const port = continuation('P01-C001', { x: 50, y: 50 }, ['P01-A01', 'P01-A02']);
    const result = stitchBoundaryLines({
      continuations: [port],
      localLines: [
        localLine({ id: 'left', path: [{ x: 0, y: 50 }, { x: 50, y: 50 }], regionDisplayId: 'P01-A01', endAnchorId: port.displayId }),
        right,
      ],
      globalLines: [globalLine(port.sourceLineId, [{ x: 0, y: 50 }, { x: 100, y: 50 }])],
    });

    expect(result.lines).toHaveLength(2);
    expect(result.unresolvedEndpoints[0]).toMatchObject({ reason, continuationId: port.displayId });
    expect(result.receipts[0].status).toBe('hold');
  });

  it('keeps close parallel C pairs isolated', () => {
    const first = continuation('P01-C001', { x: 50, y: 40 }, ['P01-A01', 'P01-A02']);
    const second = continuation('P01-C002', { x: 50, y: 42 }, ['P01-A01', 'P01-A02']);
    const result = stitchBoundaryLines({
      continuations: [first, second],
      localLines: [
        localLine({ id: 'a-left', path: [{ x: 0, y: 40 }, { x: 50, y: 40 }], regionDisplayId: 'P01-A01', endAnchorId: first.displayId }),
        localLine({ id: 'a-right', path: [{ x: 50, y: 40 }, { x: 100, y: 40 }], regionDisplayId: 'P01-A02', startAnchorId: first.displayId }),
        localLine({ id: 'b-left', path: [{ x: 0, y: 45 }, { x: 50, y: 45 }], regionDisplayId: 'P01-A01', endAnchorId: second.displayId }),
        localLine({ id: 'b-right', path: [{ x: 50, y: 45 }, { x: 100, y: 45 }], regionDisplayId: 'P01-A02', startAnchorId: second.displayId }),
      ],
      globalLines: [
        globalLine(first.sourceLineId, [{ x: 0, y: 40 }, { x: 100, y: 40 }]),
        globalLine(second.sourceLineId, [{ x: 0, y: 45 }, { x: 100, y: 45 }]),
      ],
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((item) => item.path[0].y)).toEqual([40, 45]);
    expect(result.unresolvedEndpoints).toEqual([]);
  });

  it('holds close parallel fragments when their C anchors are swapped', () => {
    const first = continuation('P01-C001', { x: 50, y: 40 }, ['P01-A01', 'P01-A02']);
    const second = continuation('P01-C002', { x: 50, y: 45 }, ['P01-A01', 'P01-A02']);
    const result = stitchBoundaryLines({
      continuations: [first, second],
      localLines: [
        localLine({ id: 'a-left', path: [{ x: 0, y: 40 }, { x: 50, y: 40 }], regionDisplayId: 'P01-A01', endAnchorId: second.displayId }),
        localLine({ id: 'a-right', path: [{ x: 50, y: 40 }, { x: 100, y: 40 }], regionDisplayId: 'P01-A02', startAnchorId: second.displayId }),
        localLine({ id: 'b-left', path: [{ x: 0, y: 42 }, { x: 50, y: 42 }], regionDisplayId: 'P01-A01', endAnchorId: first.displayId }),
        localLine({ id: 'b-right', path: [{ x: 50, y: 42 }, { x: 100, y: 42 }], regionDisplayId: 'P01-A02', startAnchorId: first.displayId }),
      ],
      globalLines: [
        globalLine(first.sourceLineId, [{ x: 0, y: 40 }, { x: 100, y: 40 }]),
        globalLine(second.sourceLineId, [{ x: 0, y: 42 }, { x: 100, y: 42 }]),
      ],
    });

    expect(result.lines).toHaveLength(4);
    expect(result.continuations.map((item) => item.status)).toEqual(['hold', 'hold']);
    expect(result.unresolvedEndpoints).toEqual([
      expect.objectContaining({ displayId: 'P01-U001', reason: 'GLOBAL_CORROBORATION_MISSING' }),
      expect.objectContaining({ displayId: 'P01-U002', reason: 'GLOBAL_CORROBORATION_MISSING' }),
    ]);
  });

  it('chains one physical line across multiple numbered region boundaries', () => {
    const first = continuation('P01-C001', { x: 50, y: 50 }, ['P01-A01', 'P01-A02']);
    const second = continuation('P01-C002', { x: 100, y: 50 }, ['P01-A02', 'P01-A03']);
    const result = stitchBoundaryLines({
      continuations: [first, second],
      localLines: [
        localLine({ id: 'one', path: [{ x: 0, y: 50 }, { x: 50, y: 50 }], regionDisplayId: 'P01-A01', endAnchorId: first.displayId }),
        { ...localLine({ id: 'two', path: [{ x: 50, y: 50 }, { x: 100, y: 50 }], regionDisplayId: 'P01-A02', startAnchorId: first.displayId }), endAnchorId: second.displayId },
        localLine({ id: 'three', path: [{ x: 100, y: 50 }, { x: 150, y: 50 }], regionDisplayId: 'P01-A03', startAnchorId: second.displayId }),
      ],
      globalLines: [globalLine(first.sourceLineId, [{ x: 0, y: 50 }, { x: 150, y: 50 }]), globalLine(second.sourceLineId, [{ x: 0, y: 50 }, { x: 150, y: 50 }])],
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].path).toEqual([{ x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }, { x: 150, y: 50 }]);
    expect(result.unresolvedEndpoints).toEqual([]);
    expect(result.receipts.map((receipt) => receipt.status)).toEqual(['merged', 'merged']);
  });
});
