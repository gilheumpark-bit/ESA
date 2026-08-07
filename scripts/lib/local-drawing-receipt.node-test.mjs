import test from 'node:test';
import assert from 'node:assert/strict';

import * as receipt from './local-drawing-receipt.mjs';

const { pipelineEvidenceFromPayload } = receipt;

test('benchmark receipt preserves review, KEC proposals, calculations, and topology', () => {
  const evidence = pipelineEvidenceFromPayload({
    textQuality: { score: 0.72 },
    constraints: [{ field: 'transformer', status: 'bounded' }],
    calcChain: [{ step: 1, calculatorId: 'cable-sizing' }],
    review: {
      summary: { pass: 1, warn: 0, fail: 1, unknown: 1, info: 0 },
      findings: [
        {
          rule: 'CABLE-AMPACITY',
          severity: 'FAIL',
          proposal: [{ action: '케이블 상향', basis: 'KEC 허용전류표' }],
        },
      ],
    },
    topology: { valid: false, issues: [{ type: 'DANGLING_INLINE_DEVICE' }] },
    saga: { status: 'COMPLETED' },
  });

  assert.equal(evidence.reviewStatus, 'FAIL');
  assert.equal(evidence.proposalCount, 1);
  assert.equal(evidence.calcChain.length, 1);
  assert.equal(evidence.topology.issues.length, 1);
  assert.equal(evidence.saga.status, 'COMPLETED');
});

test('skipped or absent review is recorded as HOLD rather than success', () => {
  assert.equal(pipelineEvidenceFromPayload({ review: { skipped: true } }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({}).reviewStatus, 'HOLD');
});

test('empty, warning, unverified scan, or topology-defective reviews never become PASS', () => {
  const summary = (patch = {}) => ({ pass: 0, warn: 0, fail: 0, unknown: 0, info: 0, ...patch });
  assert.equal(pipelineEvidenceFromPayload({ review: { summary: summary() } }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({ review: { summary: summary({ warn: 1 }) } }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({
    review: { summary: summary({ pass: 1 }), extractionSource: 'VLM-scan (미검증·HOLD)' },
  }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({
    review: { summary: summary({ pass: 1 }) },
    topology: { valid: false, issues: [{ type: 'DANGLING_INLINE_DEVICE' }] },
  }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({
    review: { summary: summary({ pass: 1 }) },
    topology: { valid: true, issues: [] },
  }).reviewStatus, 'PASS');
});

function completeDocument() {
  const roles = ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'];
  return {
    schemaVersion: 3,
    documentHash: 'a'.repeat(64),
    pageCount: 1,
    jobStatus: 'COMPLETE',
    pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 5 }],
    coverageLedger: {
      plannedRegionCount: 1,
      regionsComplete: 1,
      regionsFailed: 0,
      regionsSkippedEmpty: 0,
      allPlannedFinished: true,
      unresolvedRescans: 0,
      rolesPresent: roles,
      regions: [{
        regionId: 'P01-A01', pageIndex: 0, kind: 'full-page', status: 'complete',
        bounds: { x: 0, y: 0, w: 100, h: 100 }, requiredRoles: roles,
        roleCalls: Object.fromEntries(roles.map((role) => [role, [{ callId: `${role}-1`, success: true }]])),
      }],
    },
    evidenceGraph: {
      symbols: [
        { id: 's1', displayId: 'P01-S001', confirmedType: 'transformer', certainty: 'confirmed', evidence: [{ evidenceId: 'e1' }] },
        { id: 's2', displayId: 'P01-S002', confirmedType: 'generator', certainty: 'confirmed', evidence: [{ evidenceId: 'e2' }] },
      ],
      lines: [{ id: 'l1', displayId: 'P01-L001', certainty: 'confirmed', evidence: [{ evidenceId: 'e3' }] }],
      texts: [{ id: 't1', displayId: 'P01-T001', certainty: 'confirmed', evidence: [{ evidenceId: 'e4' }] }],
      relations: [{ id: 'r1', displayId: 'P01-R001', from: 's1', to: 's2', certainty: 'confirmed', evidence: [{ evidenceId: 'e3' }] }],
    },
    continuity: { regions: [], continuations: [], unresolvedEndpoints: [], stitchReceipts: [] },
    crossPageRelations: [],
    calculations: [{ id: 'c1', calculatorId: 'voltage-drop', compliant: true, evidenceIds: ['e1'], receiptHash: 'hash' }],
    recommendations: [{
      id: 'rec1', status: 'SUPPORTED', evidenceIds: ['e1'], calcReceiptIds: ['hash'],
      standardRefs: [], requiredInputs: [],
    }],
    unresolvedItems: [],
    verification: { claimsComplete: true, documentStatus: 'COMPLETE', holdReasons: [], evidenceTraceRate: 1, verified95: false },
  };
}

test('V3 도면을 추론 단계별 PASS/HOLD/FAIL 영수증으로 분리한다', () => {
  assert.equal(typeof receipt.reasoningStageEvidenceFromDocument, 'function');
  const result = receipt.reasoningStageEvidenceFromDocument(completeDocument());
  assert.deepEqual(result.stages.map((stage) => stage.id), [
    'input-preflight',
    'page-survey',
    'coverage-and-roles',
    'symbol-text-adjudication',
    'boundary-continuity',
    'spatial-reconciliation',
    'electrical-logic',
    'kec-calculation-recommendation',
    'final-report',
  ]);
  assert.deepEqual(result.summary, { pass: 9, hold: 0, fail: 0, overall: 'PASS' });
});

test('모호성은 HOLD로 남기고 구조 계약 위반은 FAIL로 구분한다', () => {
  const uncertain = completeDocument();
  uncertain.evidenceGraph.texts[0].certainty = 'ambiguous';
  uncertain.continuity.unresolvedEndpoints.push({ id: 'u1' });
  uncertain.unresolvedItems.push({ code: 'ELECTRICAL_LOGIC_CONFLICT' });
  uncertain.calculations = [];
  uncertain.recommendations = [];
  uncertain.verification = {
    claimsComplete: false,
    documentStatus: 'HOLD',
    holdReasons: ['AMBIGUOUS_OCR', 'LINE_CONTINUITY_UNCERTAIN', 'ELECTRICAL_LOGIC_CONFLICT'],
    evidenceTraceRate: 0.75,
    verified95: false,
  };
  const held = receipt.reasoningStageEvidenceFromDocument(uncertain);
  assert.equal(held.stages.find((stage) => stage.id === 'symbol-text-adjudication').status, 'HOLD');
  assert.equal(held.stages.find((stage) => stage.id === 'boundary-continuity').status, 'HOLD');
  assert.equal(held.stages.find((stage) => stage.id === 'electrical-logic').status, 'HOLD');
  assert.equal(held.stages.find((stage) => stage.id === 'kec-calculation-recommendation').status, 'HOLD');
  assert.equal(held.summary.overall, 'HOLD');

  const broken = completeDocument();
  broken.coverageLedger.rolesPresent = ['symbols'];
  broken.evidenceGraph.relations[0].to = 'missing-symbol';
  const failed = receipt.reasoningStageEvidenceFromDocument(broken);
  assert.equal(failed.stages.find((stage) => stage.id === 'coverage-and-roles').status, 'FAIL');
  assert.equal(failed.stages.find((stage) => stage.id === 'spatial-reconciliation').status, 'FAIL');
  assert.equal(failed.summary.overall, 'FAIL');
});

test('기호 근거 없이 래스터 선만 검출된 결과는 공간 분석 PASS가 아니다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols = [];
  document.evidenceGraph.texts = [];
  document.evidenceGraph.relations = [];
  document.evidenceGraph.lines = Array.from({ length: 20 }, (_, index) => ({
    id: `line-${index}`,
    displayId: `P01-L${String(index + 1).padStart(3, '0')}`,
    certainty: 'ambiguous',
    evidence: [{ evidenceId: `raster-${index}` }],
  }));

  const result = receipt.reasoningStageEvidenceFromDocument(document);
  const spatial = result.stages.find((stage) => stage.id === 'spatial-reconciliation');
  assert.equal(spatial.status, 'HOLD');
  assert.equal(spatial.evidence.noGraphEvidence, true);
});

test('근거가 없는 SUPPORTED 제안과 허위 verified95는 최종 단계에서 실패한다', () => {
  const forged = completeDocument();
  forged.recommendations[0] = {
    id: 'rec-forged', status: 'SUPPORTED', evidenceIds: [], calcReceiptIds: [],
    standardRefs: ['KEC 접지'], requiredInputs: [],
  };
  forged.verification.verified95 = true;
  const result = receipt.reasoningStageEvidenceFromDocument(forged);
  assert.equal(result.stages.find((stage) => stage.id === 'kec-calculation-recommendation').status, 'FAIL');
  assert.equal(result.stages.find((stage) => stage.id === 'final-report').status, 'FAIL');
  assert.equal(result.summary.overall, 'FAIL');
});

test('사전 고정 라벨과 수량·관계가 다르면 해당 추론 단계를 FAIL로 기록한다', () => {
  const document = completeDocument();
  const matched = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { symbolTypes: { transformer: 1, generator: 1 }, minRelations: 1 },
  });
  assert.equal(matched.stages.find((stage) => stage.id === 'symbol-text-adjudication').status, 'PASS');
  assert.equal(matched.stages.find((stage) => stage.id === 'spatial-reconciliation').status, 'PASS');

  const mismatched = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { symbolTypes: { transformer: 1, generator: 1, breaker: 6 }, minRelations: 3 },
  });
  const recognition = mismatched.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  const spatial = mismatched.stages.find((stage) => stage.id === 'spatial-reconciliation');
  assert.equal(recognition.status, 'FAIL');
  assert.deepEqual(recognition.evidence.labelMismatches, [{ type: 'breaker', expected: 6, actual: 0 }]);
  assert.equal(spatial.status, 'FAIL');
  assert.equal(spatial.evidence.expectedMinRelations, 3);
  assert.equal(mismatched.summary.overall, 'FAIL');
});

test('동일 차단기 별칭은 같은 기호 유형으로 집계한다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols.push({
    id: 's3', displayId: 'P01-S003', confirmedType: 'circuit_breaker',
    certainty: 'confirmed', evidence: [{ evidenceId: 'e5' }],
  });

  const result = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { symbolTypes: { transformer: 1, generator: 1, breaker: 1 }, minRelations: 1 },
  });
  const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  assert.equal(recognition.status, 'PASS');
  assert.equal(recognition.evidence.actualSymbolTypes.breaker, 1);
});

test('disconnector·isolator 별칭은 스위치 축으로 집계한다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols.push(
    { id: 's3', displayId: 'P01-S003', confirmedType: 'disconnector', certainty: 'confirmed', evidence: [{ evidenceId: 'e5' }] },
    { id: 's4', displayId: 'P01-S004', confirmedType: 'isolator_switch', certainty: 'confirmed', evidence: [{ evidenceId: 'e6' }] },
  );

  const result = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { symbolTypes: { switch: 2 } },
  });
  const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  assert.equal(recognition.status, 'PASS');
  assert.equal(recognition.evidence.actualSymbolTypes.switch, 2);
});

test('VCB·ACB 별칭과 최소 수량 라벨을 차단기 축으로 판정한다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols.push(
    { id: 's3', displayId: 'P01-S003', confirmedType: 'VCB', certainty: 'confirmed', evidence: [{ evidenceId: 'e5' }] },
    { id: 's4', displayId: 'P01-S004', confirmedType: 'breaker_acb', certainty: 'confirmed', evidence: [{ evidenceId: 'e6' }] },
  );

  const result = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { minimumSymbolTypes: { breaker: 2 }, minRelations: 1 },
  });
  const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  assert.equal(recognition.status, 'PASS');
  assert.equal(recognition.evidence.actualSymbolTypes.breaker, 2);
  assert.deepEqual(recognition.evidence.minimumLabelMismatches, []);
});

test('disconnecting_switch·DS 도 switch 골든 축으로 집계한다', () => {
  // 실측(교재형 수변전 p6): 단로기가 `disconnecting_switch` 로 나왔는데 별칭에
  // 없어 switch 축에서 빠졌다. **축에서 빠지면 과다 계수가 줄어 점수가 좋아지므로
  // 이 누락은 스스로 드러나지 않는다** — 별칭 표는 반드시 양방향으로 시험한다.
  for (const raw of ['disconnecting_switch', 'DS', 'Disconnecting Switch']) {
    const document = completeDocument();
    document.evidenceGraph.symbols.push({
      id: 's4', displayId: 'P01-S004', typeCandidates: [raw],
      certainty: 'ambiguous', evidence: [{ evidenceId: 'e6' }],
    });

    const result = receipt.reasoningStageEvidenceFromDocument(document, {
      expected: { minimumSymbolTypes: { switch: 1 } },
    });
    const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
    assert.equal(recognition.evidence.actualSymbolTypes.switch, 1, `${raw} → switch`);
  }
});

test('lightning_arrester·LA 도 arrester 골든 축으로 집계한다', () => {
  // 실측(교재형 수변전 p6): 피뢰기 라벨 "LA" 를 모델이
  // `lightning_arrester|surge_arrester|arrester` 로 냈다. 첫 후보만 보므로
  // `lightningarrester` 가 별칭에 없어 arrester 축이 0 이 됐다 — 읽기 실패가
  // 아니라 이름 불일치였다.
  for (const raw of ['lightning_arrester', 'LA', 'Lightning Arrester']) {
    const document = completeDocument();
    document.evidenceGraph.symbols.push({
      id: 's3', displayId: 'P01-S003', typeCandidates: [raw],
      certainty: 'ambiguous', evidence: [{ evidenceId: 'e5' }],
    });

    const result = receipt.reasoningStageEvidenceFromDocument(document, {
      expected: { minimumSymbolTypes: { arrester: 1 } },
    });
    const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
    assert.equal(recognition.evidence.actualSymbolTypes.arrester, 1, `${raw} → arrester`);
  }
});

test('surge_arrester는 arrester 골든 축으로 집계한다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols.push({
    id: 's3', displayId: 'P01-S003', typeCandidates: ['surge_arrester'],
    certainty: 'ambiguous', evidence: [{ evidenceId: 'e5' }],
  });

  const result = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { minimumSymbolTypes: { arrester: 1 } },
  });
  const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  assert.equal(recognition.status, 'HOLD');
  assert.equal(recognition.evidence.actualSymbolTypes.arrester, 1);
  assert.deepEqual(recognition.evidence.minimumLabelMismatches, []);
});

test('미확정 물리 수량 null은 판독된 기호 수량을 0으로 덮어쓰지 않는다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols.push(
    { id: 's3', displayId: 'P01-S003', typeCandidates: ['breaker'], certainty: 'ambiguous', evidence: [{ evidenceId: 'e5' }] },
  );
  document.equipmentCounts = [{
    equipmentKind: 'breaker',
    confirmed: 0,
    ambiguous: 1,
    missingSuspected: 0,
    physicalEquipmentCount: null,
    symbolOccurrences: 1,
    countStatus: 'HOLD',
  }];

  const result = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { minimumSymbolTypes: { breaker: 1 } },
  });
  const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  assert.equal(recognition.evidence.actualSymbolTypes.breaker, 1);
  assert.deepEqual(recognition.evidence.minimumLabelMismatches, []);
  assert.equal(recognition.status, 'HOLD');
});

test('권선 기호 수가 아니라 물리 변압기 대수로 장치 라벨을 판정한다', () => {
  const document = completeDocument();
  document.evidenceGraph.symbols = [
    { id: 'w1', displayId: 'P01-S001', confirmedType: 'transformer_winding', certainty: 'confirmed', evidence: [{ evidenceId: 'w1-e' }] },
    { id: 'w2', displayId: 'P01-S002', confirmedType: 'transformer_winding', certainty: 'confirmed', evidence: [{ evidenceId: 'w2-e' }] },
    { id: 'w3', displayId: 'P01-S003', confirmedType: 'transformer_winding', certainty: 'confirmed', evidence: [{ evidenceId: 'w3-e' }] },
  ];
  document.equipmentCounts = [{
    equipmentKind: 'transformer',
    confirmed: 3,
    ambiguous: 0,
    missingSuspected: 0,
    physicalEquipmentCount: 1,
    symbolOccurrences: 3,
    countStatus: 'COMPLETE',
  }];

  const result = receipt.reasoningStageEvidenceFromDocument(document, {
    expected: { symbolTypes: { transformer: 1 } },
  });
  const recognition = result.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  assert.equal(recognition.evidence.actualSymbolTypes.transformer, 1);
  assert.deepEqual(recognition.evidence.labelMismatches, []);
});

test('경계 연속선 영수증은 내부 ID와 표시 ID 중 어느 쪽으로도 결박된다', () => {
  const document = completeDocument();
  document.continuity.continuations.push({
    id: 'continuation-internal-1', displayId: 'P01-C001', status: 'merged',
  });
  document.continuity.stitchReceipts.push({
    id: 'stitch-1', continuationIds: ['P01-C001'], status: 'merged',
  });

  const result = receipt.reasoningStageEvidenceFromDocument(document);
  const boundary = result.stages.find((stage) => stage.id === 'boundary-continuity');
  assert.equal(boundary.status, 'PASS');
  assert.equal(boundary.evidence.missingStitchReceipts, 0);
});

test('실행은 끝났지만 근거가 부족한 부분 페이지와 감사 결과는 FAIL이 아니라 HOLD다', () => {
  const document = completeDocument();
  document.pages[0] = {
    ...document.pages[0], status: 'failed', drawingKind: 'unknown', error: 'PAGE_ANALYSIS_PARTIAL',
  };
  document.coverageLedger.regionsFailed = 1;
  document.coverageLedger.unresolvedRescans = 1;
  document.coverageLedger.rolesPresent = ['symbols', 'connections', 'text', 'logic'];
  document.coverageLedger.regions[0].status = 'failed';
  document.coverageLedger.regions[0].roleCalls['coverage-auditor'] = [{
    callId: 'auditor-output-hash', success: false,
    error: 'coverage audit found unresolved regions or graph conflicts',
  }];

  const result = receipt.reasoningStageEvidenceFromDocument(document);
  assert.equal(result.stages.find((stage) => stage.id === 'page-survey').status, 'HOLD');
  assert.equal(result.stages.find((stage) => stage.id === 'coverage-and-roles').status, 'HOLD');
});

test('래스터 페이지 종류가 미분류여도 판독 실행이 완결되면 페이지 조사는 PASS다', () => {
  const document = completeDocument();
  document.pages[0].drawingKind = 'unknown';

  const result = receipt.reasoningStageEvidenceFromDocument(document);
  const survey = result.stages.find((stage) => stage.id === 'page-survey');
  assert.equal(survey.status, 'PASS');
  assert.equal(survey.evidence.unknownPages, 1);
});

test('실패 뒤 성공한 역할 재시도는 최종 커버리지 실패로 채점하지 않는다', () => {
  const document = completeDocument();
  document.coverageLedger.regions[0].roleCalls.connections.unshift({
    callId: 'connections-first-attempt', success: false, error: 'temporary timeout',
  });

  const result = receipt.reasoningStageEvidenceFromDocument(document);
  const coverage = result.stages.find((stage) => stage.id === 'coverage-and-roles');
  assert.equal(coverage.status, 'PASS');
  assert.equal(coverage.evidence.failedRoleCalls, 1);
});
