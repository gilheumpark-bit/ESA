/**
 * Keep the production pipeline evidence that accuracy-only drawing scripts used
 * to discard. A recognition score and an electrical compliance finding are
 * different axes, so this helper does not merge them into one model grade.
 */
export function pipelineEvidenceFromPayload(payload = {}) {
  const review = payload?.review ?? null;
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  const summary = review?.summary && typeof review.summary === 'object'
    ? review.summary
    : null;
  const proposalCount = findings.reduce(
    (count, finding) => count + (Array.isArray(finding?.proposal) ? finding.proposal.length : 0),
    0,
  );

  let reviewStatus = 'HOLD';
  if (review && !review.skipped && summary) {
    const topologyIssues = Array.isArray(payload?.topology?.issues)
      ? payload.topology.issues.length
      : 0;
    const topologyHeld = payload?.topology?.valid === false || topologyIssues > 0;
    const unverifiedSource = /HOLD|미검증/i.test(String(review.extractionSource ?? ''));
    const fail = Number(summary.fail ?? 0);
    const warn = Number(summary.warn ?? 0);
    const unknown = Number(summary.unknown ?? 0);
    const pass = Number(summary.pass ?? 0);
    reviewStatus = fail > 0
      ? 'FAIL'
      : warn > 0 || unknown > 0 || pass === 0 || topologyHeld || unverifiedSource
        ? 'HOLD'
        : 'PASS';
  }

  return {
    textQuality: payload?.textQuality ?? null,
    constraints: Array.isArray(payload?.constraints) ? payload.constraints : [],
    calcChain: Array.isArray(payload?.calcChain) ? payload.calcChain : [],
    review,
    reviewStatus,
    proposalCount,
    topology: payload?.topology ?? null,
    saga: payload?.saga ?? null,
  };
}

const REQUIRED_DRAWING_ROLES = ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'];
const TERMINAL_PAGE_STATES = new Set(['complete', 'failed', 'skipped-empty']);
const REGISTERED_INTERNAL_RULES = new Set(['ESA-SLD-RULE:ORPHAN-CONNECTION']);
const STRUCTURED_STANDARD_REF = /^[A-Z][A-Za-z]*\s+\d+(?:\.\d+)*(?:\([^)]*\))?(?:\s+.+)?$/;

function stage(id, label, status, evidence) {
  return { id, label, status, evidence };
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * 정본 세부 종류 → 골든 축.
 *
 * **여기에는 별칭 표가 없다.** 2026-08-07(31차) 이후 어휘는 `spatial-graph` 가
 * 그래프 입구에서 닫으므로, 이 함수가 받는 값은 이미 `device-vocabulary` 의
 * 정본 세부 종류다(`breaker_vcb`·`current_transformer`·`arrester`…).
 *
 * 종전에는 이 파일이 **제품과 별개로 자기 별칭 표를 들고** 있었고, 그것이
 * 24차·29차 결함의 원인이었다 — 같은 개념의 정본이 둘이면 반드시 어긋난다.
 * 채점기는 별도 런타임이라 제품 모듈을 import 하지 못하지만, **파일이 아니라
 * 값이 공유되면 충분하다.**
 *
 * 아래 `LEGACY_` 접두 항목은 31차 이전에 저장된 영수증을 다시 채점할 때만 쓴다.
 * 새 영수증에는 이 형태가 나오지 않는다.
 */
export function canonicalSymbolType(value) {
  const raw = String(value ?? '').trim();
  const flat = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // 정본 세부 종류 → 골든 축. 계열 접기와 같은 사상이다.
  if (flat.startsWith('breaker')) return 'breaker';
  if (flat.startsWith('switch')) return 'switch';
  if (flat === 'fuse' || flat === 'cutoutswitch') return 'fuse';
  if (flat === 'arrester') return 'arrester';
  if (flat === 'transformer' || flat === 'transformerwinding') return 'transformer';
  // ── 31차 이전 영수증 호환. 그때는 날 문자열이 그대로 저장됐다.
  const LEGACY_BREAKER = ['vcb', 'acb', 'mccb', 'mcb', 'elb', 'rcd', 'circuitbreaker'];
  const LEGACY_SWITCH = ['disconnector', 'disconnectswitch', 'switchdisconnector',
    'disconnectingswitch', 'ds', 'isolator', 'isolatorswitch'];
  const LEGACY_ARRESTER = ['surgearrester', 'lightningarrester', 'la', 'spd'];
  if (LEGACY_BREAKER.includes(flat) || flat.includes('breaker')) return 'breaker';
  if (LEGACY_SWITCH.includes(flat)) return 'switch';
  if (LEGACY_ARRESTER.includes(flat)) return 'arrester';
  if (flat === 'powertransformer') return 'transformer';
  return raw.toLowerCase();
}

/**
 * `--resume` 영수증이 현재 셀과 같은 실행 계약인지 판정한다.
 * 반복 실행은 회차 수 자체가 실험 조건이므로, 3회 요청에 1회 영수증을 재사용하지 않는다.
 */
export function isReusableModelMatrixReceipt(prior = {}, expected = {}) {
  const requestedRepeat = Number(expected.requestedRepeat ?? 1);
  const recordedRepeat = Number(prior?.runSpread?.runCount);
  const repeatMatches = requestedRepeat === 1
    ? prior?.runSpread === undefined || recordedRepeat === 1
    : recordedRepeat === requestedRepeat;
  return prior?.status === 'COMPLETE'
    && prior.requestedModel === expected.requestedModel
    && prior.requestedEffort === expected.requestedEffort
    && (prior.requestedEffortProfile ?? null) === (expected.requestedEffortProfile ?? null)
    && prior.sourceSha256 === expected.sourceSha256
    && prior.workspaceSnapshot?.revision === expected.workspaceSnapshot?.revision
    && prior.workspaceSnapshot?.changeHash === expected.workspaceSnapshot?.changeHash
    && repeatMatches;
}

function hasTraceableStandardRef(refs) {
  return list(refs).some((ref) => {
    const value = String(ref).trim();
    return REGISTERED_INTERNAL_RULES.has(value) || STRUCTURED_STANDARD_REF.test(value);
  });
}

/**
 * Convert one production DrawingDocumentV3 into an explicit reasoning-stage
 * receipt. FAIL means a pipeline/contract break. HOLD means the pipeline ran,
 * but the drawing evidence is insufficient to make the next claim.
 */
export function reasoningStageEvidenceFromDocument(document = {}, options = {}) {
  const pages = list(document.pages);
  const coverage = document.coverageLedger ?? {};
  const regions = list(coverage.regions);
  const graph = document.evidenceGraph ?? {};
  const symbols = list(graph.symbols);
  const lines = list(graph.lines);
  const texts = list(graph.texts);
  const relations = list(graph.relations);
  const continuity = document.continuity ?? {};
  const continuations = list(continuity.continuations);
  const unresolvedEndpoints = list(continuity.unresolvedEndpoints);
  const stitchReceipts = list(continuity.stitchReceipts);
  const crossPageRelations = list(document.crossPageRelations);
  const unresolvedItems = list(document.unresolvedItems);
  const calculations = list(document.calculations);
  const recommendations = list(document.recommendations);
  const verification = document.verification ?? {};
  const expected = options.expected ?? {};
  const allEmpty = pages.length > 0 && pages.every((page) => page.status === 'skipped-empty');

  const stages = [];

  const inputOk = document.schemaVersion === 3
    && /^[a-f0-9]{64}$/i.test(String(document.documentHash ?? ''))
    && pages.length > 0;
  stages.push(stage(
    'input-preflight',
    '입력·형식·원본 지문',
    inputOk ? 'PASS' : 'FAIL',
    { schemaVersion: document.schemaVersion ?? null, pageCount: pages.length, documentHashPresent: Boolean(document.documentHash) },
  ));

  const unfinishedPages = pages.filter((page) => !TERMINAL_PAGE_STATES.has(page.status)).length;
  const failedPages = pages.filter((page) => page.status === 'failed').length;
  const partialPages = pages.filter((page) => page.status === 'failed' && page.error === 'PAGE_ANALYSIS_PARTIAL').length;
  const hardFailedPages = failedPages - partialPages;
  const unknownPages = pages.filter((page) => !page.drawingKind || page.drawingKind === 'unknown').length;
  const pageSurveyStatus = pages.length === 0 || unfinishedPages > 0 || hardFailedPages > 0
    ? 'FAIL'
    : partialPages > 0 ? 'HOLD' : 'PASS';
  stages.push(stage(
    'page-survey',
    '페이지 열거·전체 선행 조사',
    pageSurveyStatus,
    { pages: pages.length, unfinishedPages, failedPages, partialPages, hardFailedPages, unknownPages },
  ));

  const rolesPresent = new Set(list(coverage.rolesPresent));
  const missingRoles = allEmpty ? [] : REQUIRED_DRAWING_ROLES.filter((role) => !rolesPresent.has(role));
  const failedRoleCalls = regions.flatMap((region) => Object.entries(region.roleCalls ?? {}).flatMap(([role, calls]) =>
    list(calls).filter((call) => call?.success === false).map((call) => ({ role, ...call }))));
  const unrecoveredRoleFailures = regions.flatMap((region) => Object.entries(region.roleCalls ?? {}).flatMap(([role, calls]) => {
    const attempts = list(calls);
    return attempts.some((call) => call?.success === true)
      ? []
      : attempts.filter((call) => call?.success === false).map((call) => ({ role, ...call }));
  }));
  const nonAuditFailures = unrecoveredRoleFailures.filter((call) => call.role !== 'coverage-auditor');
  const auditFailures = unrecoveredRoleFailures.filter((call) => call.role === 'coverage-auditor');
  const auditReceiptMissing = auditFailures.some((call) => String(call.callId ?? '').includes(':missing'));
  const missingCoreRoles = missingRoles.filter((role) => role !== 'coverage-auditor');
  const failedRegionsWithoutReceipt = regions.filter((region) => region.status === 'failed'
    && !Object.values(region.roleCalls ?? {}).some((calls) => list(calls).some((call) => call?.success === false))).length;
  const coverageBroken = !coverage.allPlannedFinished
    || missingCoreRoles.length > 0
    || auditReceiptMissing
    || nonAuditFailures.length > 0
    || failedRegionsWithoutReceipt > 0
    || regions.some((region) => !['complete', 'failed', 'skipped-empty'].includes(region.status));
  const coverageHeld = !coverageBroken && (Number(coverage.unresolvedRescans ?? 0) > 0
    || auditFailures.length > 0
    || missingRoles.includes('coverage-auditor'));
  stages.push(stage(
    'coverage-and-roles',
    '구획 커버리지·독립 역할 호출',
    coverageBroken ? 'FAIL' : coverageHeld ? 'HOLD' : 'PASS',
    {
      plannedRegions: Number(coverage.plannedRegionCount ?? regions.length),
      completedRegions: Number(coverage.regionsComplete ?? 0),
      failedRegions: Number(coverage.regionsFailed ?? 0),
      unresolvedRescans: Number(coverage.unresolvedRescans ?? 0),
      missingRoles,
      // coverage-auditor 는 판독 역할이 아니라 파생 판정이다. rolesPresent 에
      // 들어가려면 다른 역할·재검사·그래프 충돌이 전부 해소돼야 하므로,
      // 감사기가 정상 응답해도 나머지가 하나만 남으면 "누락"으로 찍힌다.
      // 판독 역할 손실과 같은 칸에 세면 원인 진단이 뒤집힌다.
      missingCoreRoles,
      // 감사기가 응답조차 못 했는가(`:missing` 영수증) — 미해결 잔존과 다르다.
      auditReceiptMissing,
      failedRoleCalls: failedRoleCalls.length,
      auditFailures: auditFailures.length,
    },
  ));

  const ambiguousSymbols = symbols.filter((item) => item.certainty !== 'confirmed').length;
  const ambiguousTexts = texts.filter((item) => item.certainty !== 'confirmed').length;
  const nonEmptyDrawing = pages.some((page) => !['empty', 'title', 'legend'].includes(page.drawingKind));
  const noRecognitionEvidence = nonEmptyDrawing && symbols.length === 0 && texts.length === 0;
  const actualSymbolTypes = symbols.reduce((counts, item) => {
    const type = canonicalSymbolType(item.confirmedType ?? list(item.typeCandidates)[0]);
    if (type) counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const physicalSymbolTypes = list(document.equipmentCounts).reduce((counts, row) => {
    if (typeof row.physicalEquipmentCount !== 'number') return counts;
    const count = Number(row.physicalEquipmentCount);
    if (!Number.isSafeInteger(count) || count < 0) return counts;
    const type = canonicalSymbolType(row.equipmentKind);
    if (type) counts[type] = (counts[type] ?? 0) + count;
    return counts;
  }, {});
  Object.assign(actualSymbolTypes, physicalSymbolTypes);
  const labelMismatches = Object.entries(expected.symbolTypes ?? {}).flatMap(([type, count]) => {
    const canonicalType = canonicalSymbolType(type);
    const actual = Number(actualSymbolTypes[canonicalType] ?? 0);
    return actual === count ? [] : [{ type: canonicalType, expected: count, actual }];
  });
  const minimumLabelMismatches = Object.entries(expected.minimumSymbolTypes ?? {}).flatMap(([type, count]) => {
    const canonicalType = canonicalSymbolType(type);
    const actual = Number(actualSymbolTypes[canonicalType] ?? 0);
    return actual >= count ? [] : [{ type: canonicalType, expectedMinimum: count, actual }];
  });
  stages.push(stage(
    'symbol-text-adjudication',
    '기호·문자·OCR 교차 판독',
    labelMismatches.length > 0 || minimumLabelMismatches.length > 0
      ? 'FAIL'
      : ambiguousSymbols > 0 || ambiguousTexts > 0 || noRecognitionEvidence ? 'HOLD' : 'PASS',
    {
      symbols: symbols.length,
      texts: texts.length,
      ambiguousSymbols,
      ambiguousTexts,
      noRecognitionEvidence,
      actualSymbolTypes,
      labelMismatches,
      minimumLabelMismatches,
    },
  ));

  const receiptedContinuationIds = new Set(stitchReceipts.flatMap((item) => list(item.continuationIds)));
  const missingStitchReceipts = continuations.filter((item) =>
    !receiptedContinuationIds.has(item.id) && !receiptedContinuationIds.has(item.displayId)).length;
  const heldStitches = stitchReceipts.filter((item) => item.status !== 'merged').length;
  const heldContinuations = continuations.filter((item) => item.status !== 'merged').length;
  const boundaryStatus = missingStitchReceipts > 0
    ? 'FAIL'
    : unresolvedEndpoints.length > 0 || heldStitches > 0 || heldContinuations > 0 ? 'HOLD' : 'PASS';
  stages.push(stage(
    'boundary-continuity',
    '구획 경계선 C/U 연속성',
    boundaryStatus,
    {
      continuations: continuations.length,
      stitchReceipts: stitchReceipts.length,
      missingStitchReceipts,
      heldStitches,
      unresolvedEndpoints: unresolvedEndpoints.length,
    },
  ));

  const symbolIds = new Set(symbols.map((item) => item.id));
  const invalidRelationEndpoints = relations.filter((item) => !symbolIds.has(item.from) || !symbolIds.has(item.to)).length;
  const displayIds = [...symbols, ...lines, ...texts, ...relations]
    .map((item) => item.displayId)
    .filter(Boolean);
  const duplicateDisplayIds = displayIds.length - new Set(displayIds).size;
  const uncertainRelations = relations.filter((item) => item.certainty !== 'confirmed').length
    + crossPageRelations.filter((item) => item.status !== 'confirmed').length;
  const relationshipGap = symbols.length >= 2 && relations.length === 0;
  const noGraphEvidence = nonEmptyDrawing && symbols.length === 0;
  const expectedMinRelations = Number.isSafeInteger(expected.minRelations) ? expected.minRelations : null;
  const relationLabelMiss = expectedMinRelations !== null && relations.length < expectedMinRelations;
  const spatialStatus = invalidRelationEndpoints > 0 || duplicateDisplayIds > 0 || relationLabelMiss
    ? 'FAIL'
    : uncertainRelations > 0 || relationshipGap || noGraphEvidence ? 'HOLD' : 'PASS';
  stages.push(stage(
    'spatial-reconciliation',
    '전체 재결합·중복 제거·관계 그래프',
    spatialStatus,
    {
      lines: lines.length,
      relations: relations.length,
      invalidRelationEndpoints,
      duplicateDisplayIds,
      uncertainRelations,
      relationshipGap,
      noGraphEvidence,
      expectedMinRelations,
      relationLabelMiss,
    },
  ));

  const logicConflicts = unresolvedItems.filter((item) => item.code === 'ELECTRICAL_LOGIC_CONFLICT').length;
  const logicMissing = !allEmpty && !rolesPresent.has('logic');
  stages.push(stage(
    'electrical-logic',
    '전기적 논리 교차 검증',
    logicMissing ? 'FAIL' : logicConflicts > 0 ? 'HOLD' : 'PASS',
    { logicRolePresent: rolesPresent.has('logic'), conflicts: logicConflicts },
  ));

  const invalidSupported = recommendations.filter((item) => item.status === 'SUPPORTED'
    && (list(item.evidenceIds).length === 0
      || (list(item.calcReceiptIds).length === 0 && !hasTraceableStandardRef(item.standardRefs)))).length;
  const conditionalOutputs = calculations.filter((item) => item.compliant == null).length
    + recommendations.filter((item) => ['HOLD', 'CONDITIONAL'].includes(item.status)).length;
  const noEngineeringDecision = calculations.length === 0 && recommendations.length === 0;
  const engineeringStatus = invalidSupported > 0
    ? 'FAIL'
    : conditionalOutputs > 0 || noEngineeringDecision ? 'HOLD' : 'PASS';
  stages.push(stage(
    'kec-calculation-recommendation',
    'KEC·계산기·개선 제안',
    engineeringStatus,
    { calculations: calculations.length, recommendations: recommendations.length, invalidSupported, conditionalOutputs, noEngineeringDecision },
  ));

  const impossibleComplete = verification.claimsComplete === true
    && (verification.documentStatus !== 'COMPLETE' || list(verification.holdReasons).length > 0);
  const unclaimedComplete = verification.documentStatus === 'COMPLETE' && verification.claimsComplete !== true;
  const forgedVerified95 = verification.verified95 === true && !verification.verified95Receipt;
  const invalidTraceRate = !Number.isFinite(verification.evidenceTraceRate)
    || verification.evidenceTraceRate < 0
    || verification.evidenceTraceRate > 1;
  const finalBroken = impossibleComplete || unclaimedComplete || forgedVerified95 || invalidTraceRate;
  const finalHeld = !finalBroken && (verification.documentStatus !== 'COMPLETE' || verification.claimsComplete !== true);
  stages.push(stage(
    'final-report',
    '최종 상태·근거 추적·과장 방지',
    finalBroken ? 'FAIL' : finalHeld ? 'HOLD' : 'PASS',
    {
      documentStatus: verification.documentStatus ?? null,
      claimsComplete: verification.claimsComplete === true,
      evidenceTraceRate: verification.evidenceTraceRate ?? null,
      verified95: verification.verified95 === true,
      impossibleComplete,
      unclaimedComplete,
      forgedVerified95,
      invalidTraceRate,
    },
  ));

  const summary = {
    pass: stages.filter((item) => item.status === 'PASS').length,
    hold: stages.filter((item) => item.status === 'HOLD').length,
    fail: stages.filter((item) => item.status === 'FAIL').length,
    overall: stages.some((item) => item.status === 'FAIL')
      ? 'FAIL'
      : stages.some((item) => item.status === 'HOLD') ? 'HOLD' : 'PASS',
  };
  return { schemaVersion: 1, stages, summary };
}
