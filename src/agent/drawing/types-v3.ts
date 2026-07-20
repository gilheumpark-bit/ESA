/**
 * DrawingDocument schemaVersion 3 — full-read contracts (design 2026-07-21).
 * quantities (v2 mixed) is removed; use equipmentCounts + ratedValues.
 */

import type { EvidenceBounds, ImageQualityProfile } from '../vision/evidence-types';

export const DRAWING_DOCUMENT_SCHEMA_VERSION = 3 as const;

export type DocumentReadStatus = 'COMPLETE' | 'PARTIAL' | 'HOLD' | 'FAILED' | 'CANCELLED';

export type JobStatus =
  | 'QUEUED'
  | 'ENUMERATING'
  | 'SURVEYING'
  | 'ANALYZING_PAGES'
  | 'RESCANNING_GAPS'
  | 'RECONCILING_PAGES'
  | 'SYNTHESIZING'
  | 'COMPLETE'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type RoleId =
  | 'symbols'
  | 'connections'
  | 'text'
  | 'logic'
  | 'coverage-auditor';

export type ReadFailureCode =
  | 'UNREADABLE_TEXT'
  | 'UNREADABLE_SYMBOL'
  | 'UNREADABLE_LINE'
  | 'LINE_CONTINUITY_UNCERTAIN'
  | 'AMBIGUOUS_OCR'
  | 'LOW_RESOLUTION_HOLD'
  | 'HOLD_RESCAN_UNRESOLVED'
  | 'BOUNDARY_CLIP'
  | 'EMPTY_REGION_RESULT'
  | 'ROLE_CALL_FAILED'
  | 'PARTIAL_BUDGET_EXCEEDED';

export type Certainty = 'confirmed' | 'ambiguous' | 'unread';
export type CountStatus = 'COMPLETE' | 'CONDITIONAL' | 'HOLD';
export type RecommendationStatus = 'SUPPORTED' | 'CONDITIONAL' | 'HOLD' | 'REJECTED';
export type OcrAdjudicationStatus =
  | 'CONFIRMED_BY_MAJORITY_AND_CONTEXT'
  | 'AMBIGUOUS'
  | 'UNREADABLE_TEXT';

export interface DocumentBudget {
  maxPages: number;
  maxVlmCalls: number;
  maxPixels: number;
  deadlineMs: number;
}

export interface DocumentInventoryPage {
  pageIndex: number;
  width: number;
  height: number;
  renderMode: 'vector' | 'raster' | 'hybrid';
  drawingKind?: 'sld' | 'sequence' | 'layout' | 'legend' | 'title' | 'mixed' | 'unknown' | 'empty';
}

export interface DocumentInventory {
  drawingHash: string;
  mimeType: string;
  formatClass: 'raster-image' | 'vector-pdf' | 'raster-pdf' | 'mixed-pdf' | 'dxf';
  pages: DocumentInventoryPage[];
  requestedPagePolicy: 'all' | { pages: number[] };
}

export interface EvidenceRef {
  evidenceId: string;
  pageIndex: number;
  bounds: EvidenceBounds;
  regionId?: string;
  variantId?: string;
  callId?: string;
  role?: RoleId;
  confidence: number;
}

export interface SymbolNode {
  id: string;
  displayId: string;
  equipmentId?: string;
  typeCandidates: string[];
  confirmedType?: string;
  rawLabel?: string;
  certainty: Certainty;
  evidence: EvidenceRef[];
  ports?: Array<{ x: number; y: number }>;
}

export interface LineNode {
  id: string;
  displayId: string;
  lineKind: 'power' | 'control' | 'ground' | 'bus' | 'unknown';
  path: Array<{ x: number; y: number }>;
  certainty: Certainty;
  evidence: EvidenceRef[];
  holdCode?: ReadFailureCode;
}

export interface TextNode {
  id: string;
  displayId: string;
  rawText: string;
  confirmedText?: string;
  candidates: string[];
  certainty: Certainty;
  evidence: EvidenceRef[];
  holdCode?: ReadFailureCode;
}

export interface RelationEdge {
  id: string;
  displayId: string;
  from: string;
  to: string;
  lineId?: string;
  certainty: Certainty;
  evidence: EvidenceRef[];
}

export interface CrossPageRelation {
  id: string;
  displayId: string;
  fromPage: number;
  toPage: number;
  fromRef: string;
  toRef: string;
  status: 'confirmed' | 'candidate' | 'hold';
  reason?: string;
  evidence: EvidenceRef[];
}

export interface EquipmentCountRow {
  equipmentKind: string;
  confirmed: number;
  ambiguous: number;
  missingSuspected: number;
  physicalEquipmentCount: number | null;
  symbolOccurrences: number;
  countStatus: CountStatus;
}

export interface RatedValue {
  id: string;
  displayId: string;
  field: string;
  raw: string;
  normalized?: { value: number; unit: string };
  equipmentId?: string;
  certainty: Certainty;
  evidence: EvidenceRef[];
}

export interface CalculationLink {
  id: string;
  calculatorId: string;
  label: string;
  value?: number;
  unit?: string;
  compliant: boolean | null;
  receiptHash?: string;
  evidenceIds: string[];
  note?: string;
}

export interface RecommendationV3 {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  priority: number;
  problem: string;
  relatedDisplayIds: string[];
  evidenceIds: string[];
  calcReceiptIds: string[];
  standardRefs: string[];
  requiredInputs: string[];
  recommendedAction: string;
  expectedEffect?: string;
  status: RecommendationStatus;
}

export interface UnresolvedItem {
  id: string;
  code: ReadFailureCode;
  displayId?: string;
  pageIndex: number;
  regionId?: string;
  bounds: EvidenceBounds;
  candidates?: string[];
  recommendedUpload?: {
    minLongEdgePx?: number;
    minCharHeightPx?: number;
    note: string;
  };
  userConfirmItems?: Array<{ question: string; options?: string[] }>;
  note: string;
}

export interface UserCorrection {
  correctionId: string;
  targetDisplayId: string;
  originalCandidates: string[];
  selectedValue: string;
  correctedAt: string;
  correctedBy: string;
  affectedEntityIds: string[];
  recalcBefore?: unknown;
  recalcAfter?: unknown;
  /** Never auto-train; golden only after independent review */
  goldenEligible: false;
}

export interface CoverageRegionRecord {
  regionId: string;
  pageIndex: number;
  status: 'planned' | 'running' | 'complete' | 'failed' | 'skipped-empty';
  roleCalls: Partial<Record<RoleId, string>>;
}

export interface CoverageLedger {
  plannedRegionCount: number;
  regionsComplete: number;
  regionsFailed: number;
  regionsSkippedEmpty: number;
  regions: CoverageRegionRecord[];
  rolesPresent: RoleId[];
  unresolvedRescans: number;
  allPlannedFinished: boolean;
}

export interface PageAnalysisState {
  pageIndex: number;
  status: 'pending' | 'surveying' | 'analyzing' | 'complete' | 'failed' | 'skipped-empty';
  drawingKind: DocumentInventoryPage['drawingKind'];
  quality?: ImageQualityProfile;
  error?: string;
  vlmCalls: number;
}

export interface VerificationBlock {
  claimsComplete: boolean;
  documentStatus: DocumentReadStatus;
  holdReasons: ReadFailureCode[];
  evidenceTraceRate: number;
  verified95: boolean;
  verified95Receipt?: {
    datasetHash: string;
    labelHash: string;
    predictionHash: string;
    engineVersion: string;
    promptVersion: string;
    preprocessVersion: string;
    evaluatorVersion: string;
    metrics: Record<string, number>;
    signedAt: string;
    signature: string;
  };
  productionFingerprint?: {
    engineVersion: string;
    promptVersion: string;
    preprocessVersion: string;
    model?: string;
    provider?: string;
  };
}

export interface DrawingDocumentV3 {
  schemaVersion: typeof DRAWING_DOCUMENT_SCHEMA_VERSION;
  documentHash: string;
  pageCount: number;
  requestedPages: number[] | 'all';
  jobStatus: JobStatus;
  pages: PageAnalysisState[];
  coverageLedger: CoverageLedger;
  evidenceGraph: {
    symbols: SymbolNode[];
    lines: LineNode[];
    texts: TextNode[];
    relations: RelationEdge[];
  };
  crossPageRelations: CrossPageRelation[];
  equipmentCounts: EquipmentCountRow[];
  ratedValues: RatedValue[];
  calculations: CalculationLink[];
  recommendations: RecommendationV3[];
  unresolvedItems: UnresolvedItem[];
  userCorrections: UserCorrection[];
  verification: VerificationBlock;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentReadReceipt {
  status: DocumentReadStatus;
  drawingHash: string;
  pageCount: number;
  pagesCompleted: number;
  plannedRegionCount: number;
  regionsComplete: number;
  regionsFailed: number;
  regionsSkippedEmpty: number;
  rolesPresent: RoleId[];
  unresolvedRescans: number;
  holdReasons: ReadFailureCode[];
  claimsComplete: boolean;
}

export interface OcrReading {
  variantId: 'original' | 'lanczos-4x' | 'text-high-contrast';
  text: string;
  confidence: number;
  callId: string;
}

export interface OcrCandidateSet {
  displayId: string;
  pageIndex: number;
  bounds: EvidenceBounds;
  readings: OcrReading[];
  context: {
    adjacentSymbolTypes: string[];
    legendTerms: string[];
    conflictingTags: string[];
  };
  status: OcrAdjudicationStatus;
  confirmedText?: string;
}

export const ENGINE_VERSION = 'drawing-full-read-1.0.0';
export const PROMPT_VERSION = 'role-prompts-v1';
export const PREPROCESS_VERSION = 'lanczos-variants-v1';
export const EVALUATOR_VERSION = 'sld-evaluator-v2.0.0';
export const GRAPH_ASSEMBLY_VERSION = 'evidence-graph-v1';
