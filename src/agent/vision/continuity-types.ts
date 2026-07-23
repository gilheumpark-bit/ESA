import type { AnalysisRegionPlan, EvidenceBounds, Point } from './evidence-types';

export type ContinuityLineKind = 'power' | 'bus' | 'control' | 'ground' | 'unknown';

export interface GlobalLineCandidate {
  id: string;
  path: Point[];
  lineKind: ContinuityLineKind;
  source: 'vector' | 'global-vision' | 'local-candidate';
  confidence: number;
  junctions: Point[];
}

export interface ContinuationObservation {
  regionId: string;
  regionDisplayId: string;
  side: 'top' | 'right' | 'bottom' | 'left' | 'corner';
  point: Point;
  tangent: Point;
  confidence: number;
}

export interface BoundaryContinuation {
  id: string;
  displayId: string;
  pageIndex: number;
  point: Point;
  seams: Array<{ orientation: 'vertical' | 'horizontal'; index: number }>;
  tangent: Point;
  lineKind: ContinuityLineKind;
  sourceLineId: string;
  source: GlobalLineCandidate['source'];
  status: 'planned' | 'paired' | 'merged' | 'ambiguous' | 'hold';
  observations: ContinuationObservation[];
}

export interface BoundaryContinuationPlan {
  regions: AnalysisRegionPlan[];
  continuations: BoundaryContinuation[];
  seamAlignedLineIds: string[];
  warnings: string[];
}

export interface BoundaryContinuationInput {
  pageIndex: number;
  regions: readonly AnalysisRegionPlan[];
  lines: readonly GlobalLineCandidate[];
  deviceBounds?: readonly EvidenceBounds[];
  tolerance?: number;
}

export type UnresolvedEndpointReason =
  | 'UNKNOWN_CONTINUATION'
  | 'UNPAIRED_CONTINUATION'
  | 'TANGENT_MISMATCH'
  | 'LINE_KIND_MISMATCH'
  | 'GLOBAL_CORROBORATION_MISSING'
  | 'REGION_MISMATCH'
  | 'DISTANCE_MISMATCH'
  | 'INTERIOR_OPEN_END';

export interface UnresolvedEndpoint {
  id: string;
  displayId: string;
  pageIndex: number;
  regionId?: string;
  localLineId: string;
  continuationId?: string;
  point: Point;
  reason: UnresolvedEndpointReason;
}

export interface StitchReceipt {
  continuationIds: string[];
  consumedLocalLineIds: string[];
  outputLineId?: string;
  checks: {
    adjacency: boolean;
    cardinality: boolean;
    distance: boolean;
    tangent: boolean;
    lineKind: boolean;
    globalCorroboration: boolean;
  };
  status: 'merged' | 'hold';
}
