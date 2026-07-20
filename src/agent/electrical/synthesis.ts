import type { DrawingCalculationReceipt } from './drawing-calculation-router';
import type { ElectricalIssue } from './electrical-invariants';
import type { LogicConflict } from './logic-conflicts';
import type { NormalizedElectricalGraph } from './domain-normalizer';
import type { RoleReviewEnvelope, ReviewRole } from '../vision/review-types';

export type DrawingSynthesisVerdict = 'PASS' | 'CONDITIONAL' | 'FAIL';
export type SynthesisStageStatus = 'COMPLETE' | 'HOLD' | 'NOT_RUN';

export interface SynthesisEvidenceRecord {
  id: string;
  drawingHash: string;
  kind: 'source' | 'derived';
  originalEvidenceIds: string[];
  sourceIds: string[];
  pages: number[];
  parentEvidenceIds: string[];
}

export interface SynthesisClaimInput {
  id: string;
  text: string;
  evidenceIds: string[];
  status: 'verified' | 'disputed' | 'hold';
  requiredInputs: string[];
}

export type SynthesisClaim = SynthesisClaimInput;

export interface SynthesisRecommendationInput {
  id: string;
  category: 'safety' | 'efficiency' | 'cost' | 'reliability';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  evidenceIds: string[];
  requiredInputs: string[];
}

export interface SynthesisRecommendation extends SynthesisRecommendationInput {
  status: 'SUPPORTED' | 'HOLD';
}

export interface DrawingSynthesisInput {
  drawingHash: string;
  completedRoles: ReviewRole[];
  coverageComplete: boolean;
  roleFailures: Array<{ role: ReviewRole; sourceId: string; fatal: boolean }>;
  logicEnvelope?: RoleReviewEnvelope;
  normalizedGraph?: NormalizedElectricalGraph;
  issues?: ElectricalIssue[];
  calculations?: DrawingCalculationReceipt[];
  logicConflicts?: LogicConflict[];
  claims: SynthesisClaimInput[];
  recommendations: SynthesisRecommendationInput[];
}

export interface DrawingSynthesis {
  drawingHash: string;
  requiredRoles: ReviewRole[];
  completedRoles: ReviewRole[];
  missingRoles: ReviewRole[];
  reviewIntegrity: {
    coverageComplete: boolean;
    roleFailures: Array<{ role: ReviewRole; sourceId: string; fatal: boolean }>;
  };
  stages: {
    normalizer: SynthesisStageStatus;
    invariants: SynthesisStageStatus;
    calculator: SynthesisStageStatus;
    logicResolver: SynthesisStageStatus;
    synthesis: 'COMPLETE';
  };
  evidenceRegistry: SynthesisEvidenceRecord[];
  calculations: DrawingCalculationReceipt[];
  issues: ElectricalIssue[];
  conflicts: LogicConflict[];
  claims: SynthesisClaim[];
  recommendations: SynthesisRecommendation[];
  graphConflicts: string[];
  verdict: DrawingSynthesisVerdict;
  requiresHumanReview: boolean;
}

export class UnsupportedSynthesisClaimError extends Error {
  readonly code = 'UNSUPPORTED_SYNTHESIS_CLAIM';

  constructor() {
    super('UNSUPPORTED_SYNTHESIS_CLAIM');
    this.name = 'UnsupportedSynthesisClaimError';
  }
}

const REQUIRED_ROLES: readonly ReviewRole[] = ['symbols', 'connections', 'text', 'logic'];
const HOLD_CLAIM_QUESTION = '종합 판단에 필요한 현재 도면 근거를 확인해야 합니다.';
const HOLD_RECOMMENDATION_TITLE = '도면 근거 확인 필요';
const HOLD_RECOMMENDATION_DESCRIPTION = '제안 판단에 필요한 현재 도면 근거를 확인해야 합니다.';
const CURRENT_DRAWING_EVIDENCE = 'current drawing evidence';

type Registry = {
  readonly records: Map<string, SynthesisEvidenceRecord>;
  readonly aliases: Map<string, Set<string>>;
  readonly graphAliases: Map<string, Set<string>>;
  readonly logicAliases: Map<string, Set<string>>;
  integrityGap: boolean;
};

type EvidenceNamespace = 'graph' | 'logic';

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function sortedPages(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function recordKey(record: SynthesisEvidenceRecord): string {
  return [
    record.id,
    record.kind,
    record.originalEvidenceIds.join('\u0000'),
    record.sourceIds.join('\u0000'),
    record.pages.join('\u0000'),
    record.parentEvidenceIds.join('\u0000'),
  ].join('\u0001');
}

function addAliases(registry: Registry, target: Map<string, Set<string>>, key: string, aliases: readonly string[]): void {
  for (const alias of aliases) {
    if (alias.length === 0) continue;
    const candidates = target.get(alias) ?? new Set<string>();
    candidates.add(key);
    target.set(alias, candidates);
    if (candidates.size > 1) registry.integrityGap = true;
  }
}

function addRecord(registry: Registry, record: SynthesisEvidenceRecord, aliases: readonly string[], namespace?: EvidenceNamespace): void {
  const stableRecord: SynthesisEvidenceRecord = {
    ...record,
    originalEvidenceIds: sortedUnique(record.originalEvidenceIds),
    sourceIds: sortedUnique(record.sourceIds),
    pages: sortedPages(record.pages),
    parentEvidenceIds: sortedUnique(record.parentEvidenceIds),
  };
  const key = recordKey(stableRecord);
  registry.records.set(key, stableRecord);
  addAliases(registry, registry.aliases, key, aliases);
  if (namespace === 'graph') addAliases(registry, registry.graphAliases, key, aliases);
  if (namespace === 'logic') addAliases(registry, registry.logicAliases, key, aliases);
}

function addSourceRecord(
  registry: Registry,
  drawingHash: string,
  id: string,
  originalEvidenceIds: readonly string[],
  sourceIds: readonly string[],
  pages: readonly number[],
  namespace?: EvidenceNamespace,
): void {
  if (id.length === 0 || originalEvidenceIds.length === 0 || sourceIds.length === 0 || pages.length === 0) {
    registry.integrityGap = true;
    return;
  }
  const record: SynthesisEvidenceRecord = {
    id,
    drawingHash,
    kind: 'source',
    originalEvidenceIds: [...originalEvidenceIds],
    sourceIds: [...sourceIds],
    pages: [...pages],
    parentEvidenceIds: [],
  };
  addRecord(registry, record, [id, ...originalEvidenceIds, ...sourceIds], namespace);
}

function rootGraphIsCurrent(input: DrawingSynthesisInput): input is DrawingSynthesisInput & { normalizedGraph: NormalizedElectricalGraph } {
  return input.normalizedGraph !== undefined
    && input.normalizedGraph.drawingHash === input.drawingHash
    && input.normalizedGraph.graph.drawingHash === input.drawingHash;
}

function logicEnvelopeIsCurrent(input: DrawingSynthesisInput): input is DrawingSynthesisInput & { logicEnvelope: RoleReviewEnvelope } {
  return input.logicEnvelope !== undefined
    && input.logicEnvelope.role === 'logic'
    && input.logicEnvelope.drawingHash === input.drawingHash;
}

function buildRegistry(input: DrawingSynthesisInput): Registry {
  const registry: Registry = {
    records: new Map<string, SynthesisEvidenceRecord>(),
    aliases: new Map<string, Set<string>>(),
    graphAliases: new Map<string, Set<string>>(),
    logicAliases: new Map<string, Set<string>>(),
    integrityGap: false,
  };
  if (input.normalizedGraph !== undefined && !rootGraphIsCurrent(input)) registry.integrityGap = true;
  if (rootGraphIsCurrent(input)) {
    const graph = input.normalizedGraph.graph;
    for (const symbol of graph.symbols) addSourceRecord(registry, input.drawingHash, symbol.id, symbol.originalEvidenceIds, symbol.sourceIds, [symbol.bounds.page], 'graph');
    for (const line of graph.lines) addSourceRecord(registry, input.drawingHash, line.id, line.originalEvidenceIds, line.sourceIds, line.pages, 'graph');
    for (const text of graph.texts) addSourceRecord(registry, input.drawingHash, text.id, text.originalEvidenceIds, text.sourceIds, [text.bounds.page], 'graph');
    for (const spec of input.normalizedGraph.specs) {
      if (spec.drawingHash !== input.drawingHash) {
        registry.integrityGap = true;
        continue;
      }
      addSourceRecord(registry, input.drawingHash, spec.evidenceId, spec.originalEvidenceIds, spec.sourceIds, [spec.bounds.page], 'graph');
    }
  }
  if (input.logicEnvelope !== undefined && !logicEnvelopeIsCurrent(input)) registry.integrityGap = true;
  if (logicEnvelopeIsCurrent(input)) {
    for (const evidence of input.logicEnvelope.data.logic ?? []) {
      addSourceRecord(
        registry,
        input.drawingHash,
        evidence.id,
        [evidence.id],
        evidence.sourceId === undefined ? [] : [evidence.sourceId],
        evidence.evidenceBounds.map((bound) => bound.page),
        'logic',
      );
    }
  }
  return registry;
}

function resolveUnique(registry: Registry, aliases: ReadonlyMap<string, Set<string>>, id: string): SynthesisEvidenceRecord | undefined {
  const candidates = aliases.get(id);
  if (candidates === undefined || candidates.size !== 1) return undefined;
  const key = [...candidates][0];
  return registry.records.get(key);
}

function resolveAll(registry: Registry, evidenceIds: readonly string[], aliases: ReadonlyMap<string, Set<string>> = registry.aliases): SynthesisEvidenceRecord[] | undefined {
  if (evidenceIds.length === 0) return undefined;
  const resolved = evidenceIds.map((id) => resolveUnique(registry, aliases, id));
  return resolved.every((record): record is SynthesisEvidenceRecord => record !== undefined) ? resolved : undefined;
}

function resolveCurrentEvidence(
  registry: Registry,
  evidenceIds: readonly string[],
  namespaceAliases: ReadonlyMap<string, Set<string>>,
): SynthesisEvidenceRecord[] | undefined {
  const namespaceRecords = resolveAll(registry, evidenceIds, namespaceAliases);
  const globalRecords = resolveAll(registry, evidenceIds);
  if (namespaceRecords === undefined || globalRecords === undefined) return undefined;
  const parent = namespaceRecords[0];
  return parent !== undefined
    && namespaceRecords.every((record) => record === parent)
    && globalRecords.every((record) => record === parent)
    ? namespaceRecords
    : undefined;
}

function resolveCurrentGraphEvidence(registry: Registry, evidenceIds: readonly string[]): SynthesisEvidenceRecord[] | undefined {
  return resolveCurrentEvidence(registry, evidenceIds, registry.graphAliases);
}

function resolveCurrentLogicEvidence(registry: Registry, evidenceIds: readonly string[]): SynthesisEvidenceRecord[] | undefined {
  return resolveCurrentEvidence(registry, evidenceIds, registry.logicAliases);
}

function addDerivedRecord(
  registry: Registry,
  drawingHash: string,
  id: string,
  parents: readonly SynthesisEvidenceRecord[],
): void {
  addRecord(registry, {
    id,
    drawingHash,
    kind: 'derived',
    originalEvidenceIds: parents.flatMap((parent) => parent.originalEvidenceIds),
    sourceIds: parents.flatMap((parent) => parent.sourceIds),
    pages: parents.flatMap((parent) => parent.pages),
    parentEvidenceIds: parents.map((parent) => parent.id),
  }, [id]);
}

function receiptParents(registry: Registry, receipt: DrawingCalculationReceipt): SynthesisEvidenceRecord[] | undefined {
  if (receipt.status === 'SKIPPED'
    && receipt.missingInputs.length === 0
    && receipt.ambiguousInputs.length === 0) return undefined;
  if (receipt.status !== 'SKIPPED' && receipt.inputEvidence.length === 0) return undefined;
  if (receipt.status === 'SKIPPED' && receipt.inputEvidence.length === 0) return [];
  const parents = receipt.inputEvidence.map((evidence) => resolveCurrentGraphEvidence(registry, [
    evidence.evidenceId,
    ...evidence.originalEvidenceIds,
    ...evidence.sourceIds,
  ]));
  return parents.every((records): records is SynthesisEvidenceRecord[] => records !== undefined)
    ? parents.flat()
    : undefined;
}

function issueParents(registry: Registry, issue: ElectricalIssue, drawingHash: string): SynthesisEvidenceRecord[] | undefined {
  if (issue.evidence.drawingHash !== drawingHash) return undefined;
  return resolveCurrentGraphEvidence(registry, [
    ...issue.evidence.stableIds,
    ...issue.evidence.originalEvidenceIds,
    ...issue.evidence.sourceIds,
  ]);
}

function conflictParents(registry: Registry, conflict: LogicConflict): SynthesisEvidenceRecord[] | undefined {
  const graphParents = resolveCurrentGraphEvidence(registry, [
    ...conflict.graphEvidenceIds,
    ...conflict.graphOriginalEvidenceIds,
    ...conflict.graphSourceIds,
  ]);
  const logicParents = resolveCurrentLogicEvidence(registry, conflict.logicEvidenceIds);
  return graphParents === undefined || logicParents === undefined ? undefined : [...graphParents, ...logicParents];
}

function sortById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareText(left.id, right.id));
}

function sortRoleFailures(
  failures: readonly { role: ReviewRole; sourceId: string; fatal: boolean }[],
): Array<{ role: ReviewRole; sourceId: string; fatal: boolean }> {
  return failures.map(clone).sort((left, right) => compareText(left.role, right.role) || compareText(left.sourceId, right.sourceId) || Number(left.fatal) - Number(right.fatal));
}

function stageForInvariants(issues: readonly ElectricalIssue[] | undefined, validIssues: readonly ElectricalIssue[], invalid: boolean): SynthesisStageStatus {
  if (issues === undefined) return 'NOT_RUN';
  if (invalid || issues.length !== validIssues.length) return 'HOLD';
  return validIssues.some((issue) => issue.judgment === 'HOLD' || issue.judgment === 'BLOCK') ? 'HOLD' : 'COMPLETE';
}

function stageForCalculations(receipts: readonly DrawingCalculationReceipt[] | undefined, validReceipts: readonly DrawingCalculationReceipt[]): SynthesisStageStatus {
  if (receipts === undefined) return 'NOT_RUN';
  if (receipts.length === 0 || receipts.length !== validReceipts.length) return 'HOLD';
  return receipts.some((receipt) => receipt.status === 'ERROR') ? 'HOLD' : 'COMPLETE';
}

function stageForLogic(
  conflicts: readonly LogicConflict[] | undefined,
  validConflicts: readonly LogicConflict[],
  currentEnvelope: boolean,
): SynthesisStageStatus {
  if (conflicts === undefined) return 'NOT_RUN';
  if (!currentEnvelope || conflicts.length !== validConflicts.length) return 'HOLD';
  return validConflicts.some((conflict) => conflict.kind === 'UNRESOLVED_LOGIC_REFERENCE' || conflict.status === 'hold') ? 'HOLD' : 'COMPLETE';
}

function normalizeClaim(claim: SynthesisClaimInput, registry: Registry): SynthesisClaim {
  const evidenceIds = sortedUnique(claim.evidenceIds);
  const requiredInputs = sortedUnique(claim.requiredInputs);
  if (claim.status === 'verified' || claim.status === 'disputed') {
    if (resolveAll(registry, evidenceIds) === undefined) throw new UnsupportedSynthesisClaimError();
    return { ...clone(claim), evidenceIds, requiredInputs };
  }
  if (evidenceIds.length === 0 || resolveAll(registry, evidenceIds) === undefined || requiredInputs.length === 0) {
    return {
      id: claim.id,
      text: HOLD_CLAIM_QUESTION,
      evidenceIds: [],
      status: 'hold',
      requiredInputs: [CURRENT_DRAWING_EVIDENCE],
    };
  }
  return { ...clone(claim), evidenceIds, requiredInputs };
}

function normalizeRecommendation(recommendation: SynthesisRecommendationInput, registry: Registry): SynthesisRecommendation {
  const evidenceIds = sortedUnique(recommendation.evidenceIds);
  if (resolveAll(registry, evidenceIds) === undefined) {
    return {
      id: recommendation.id,
      category: recommendation.category,
      title: HOLD_RECOMMENDATION_TITLE,
      description: HOLD_RECOMMENDATION_DESCRIPTION,
      impact: recommendation.impact,
      evidenceIds: [],
      requiredInputs: [CURRENT_DRAWING_EVIDENCE],
      status: 'HOLD',
    };
  }
  return { ...clone(recommendation), evidenceIds, requiredInputs: sortedUnique(recommendation.requiredInputs), status: 'SUPPORTED' };
}

function compareEvidenceRecords(left: SynthesisEvidenceRecord, right: SynthesisEvidenceRecord): number {
  return compareText(left.id, right.id)
    || compareText(left.kind, right.kind)
    || compareText(left.originalEvidenceIds.join('\u0000'), right.originalEvidenceIds.join('\u0000'))
    || compareText(left.sourceIds.join('\u0000'), right.sourceIds.join('\u0000'));
}

export function synthesizeDrawingReview(input: DrawingSynthesisInput): DrawingSynthesis {
  const registry = buildRegistry(input);
  const validCalculations: DrawingCalculationReceipt[] = [];
  for (const receipt of input.calculations ?? []) {
    const parents = receiptParents(registry, receipt);
    if (parents === undefined) {
      registry.integrityGap = true;
      continue;
    }
    const receiptCopy = clone(receipt);
    validCalculations.push(receiptCopy);
    if (receiptCopy.status === 'CALCULATED') addDerivedRecord(registry, input.drawingHash, receiptCopy.id, parents);
  }
  const validIssues: ElectricalIssue[] = [];
  for (const issue of input.issues ?? []) {
    const parents = issueParents(registry, issue, input.drawingHash);
    if (parents === undefined) {
      registry.integrityGap = true;
      continue;
    }
    const issueCopy = clone(issue);
    validIssues.push(issueCopy);
    addDerivedRecord(registry, input.drawingHash, issueCopy.id, parents);
  }
  const validConflicts: LogicConflict[] = [];
  for (const conflict of input.logicConflicts ?? []) {
    const parents = logicEnvelopeIsCurrent(input) ? conflictParents(registry, conflict) : undefined;
    if (parents === undefined) {
      registry.integrityGap = true;
      continue;
    }
    const conflictCopy = clone(conflict);
    validConflicts.push(conflictCopy);
    addDerivedRecord(registry, input.drawingHash, conflictCopy.id, parents);
  }

  const claims = input.claims.map((claim) => normalizeClaim(claim, registry)).sort((left, right) => compareText(left.id, right.id));
  const recommendations = input.recommendations.map((recommendation) => normalizeRecommendation(recommendation, registry)).sort((left, right) => compareText(left.id, right.id));
  const completedRoles = sortedUnique(input.completedRoles.filter((role) => REQUIRED_ROLES.includes(role))) as ReviewRole[];
  const missingRoles = REQUIRED_ROLES.filter((role) => !completedRoles.includes(role));
  const graphConflicts = rootGraphIsCurrent(input) ? sortedUnique(input.normalizedGraph.graph.conflicts) : [];
  const normalizer: SynthesisStageStatus = input.normalizedGraph === undefined ? 'NOT_RUN' : rootGraphIsCurrent(input) ? 'COMPLETE' : 'HOLD';
  const stages = {
    normalizer,
    invariants: stageForInvariants(input.issues, validIssues, registry.integrityGap),
    calculator: stageForCalculations(input.calculations, validCalculations),
    logicResolver: stageForLogic(input.logicConflicts, validConflicts, logicEnvelopeIsCurrent(input)),
    synthesis: 'COMPLETE' as const,
  };
  const requiresHumanReview = missingRoles.length > 0
    || !input.coverageComplete
    || input.roleFailures.length > 0
    || stages.normalizer !== 'COMPLETE'
    || stages.invariants !== 'COMPLETE'
    || stages.calculator !== 'COMPLETE'
    || stages.logicResolver !== 'COMPLETE'
    || graphConflicts.length > 0
    || registry.integrityGap
    || claims.some((claim) => claim.status === 'hold')
    || recommendations.some((recommendation) => recommendation.status === 'HOLD');
  const confirmedFailure = validIssues.some((issue) => issue.judgment === 'FAIL')
    || validConflicts.some((conflict) => conflict.kind === 'CONTRADICTION');

  return {
    drawingHash: input.drawingHash,
    requiredRoles: [...REQUIRED_ROLES],
    completedRoles,
    missingRoles,
    reviewIntegrity: {
      coverageComplete: input.coverageComplete,
      roleFailures: sortRoleFailures(input.roleFailures),
    },
    stages,
    evidenceRegistry: [...registry.records.values()].map(clone).sort(compareEvidenceRecords),
    calculations: sortById(validCalculations),
    issues: sortById(validIssues),
    conflicts: sortById(validConflicts),
    claims,
    recommendations,
    graphConflicts,
    verdict: confirmedFailure ? 'FAIL' : requiresHumanReview ? 'CONDITIONAL' : 'PASS',
    requiresHumanReview,
  };
}
