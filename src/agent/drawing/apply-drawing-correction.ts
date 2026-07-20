import { randomUUID } from 'node:crypto';

import { assignPhysicalEquipmentIds, buildEquipmentCounts } from './count-register';
import { extractPageRefHits, reconcileCrossPage } from './cross-page-graph';
import { buildDrawingDocumentV3 } from './drawing-document-report';
import { buildPageRelations, findUnboundLineItems } from './evidence-deduplicator';
import { extractRatedValues } from './rated-value-extractor';
import { buildRecommendations } from './recommendation-engine';
import type { DrawingDocumentV3, UnresolvedItem, UserCorrection } from './types-v3';

export interface DrawingCorrectionInput {
  targetDisplayId: string;
  selectedValue: string;
  correctedBy: string;
  sourceAvailable?: boolean;
}

export function applyDrawingCorrection(
  current: DrawingDocumentV3,
  input: DrawingCorrectionInput,
): DrawingDocumentV3 {
  const textTarget = current.evidenceGraph.texts.find((item) => item.displayId === input.targetDisplayId);
  const symbolTarget = current.evidenceGraph.symbols.find((item) => item.displayId === input.targetDisplayId);
  if (!textTarget && !symbolTarget) throw new Error('DRAWING_CORRECTION_TARGET_NOT_FOUND');

  const targetEvidenceIds = new Set([
    ...(textTarget?.evidence.map((item) => item.evidenceId) ?? []),
    ...(symbolTarget?.evidence.map((item) => item.evidenceId) ?? []),
  ]);
  const targetPage = textTarget?.evidence[0]?.pageIndex ?? symbolTarget?.evidence[0]?.pageIndex ?? 0;
  const texts = current.evidenceGraph.texts.map((item) => item.displayId === input.targetDisplayId
    ? {
      ...item,
      confirmedText: input.selectedValue,
      candidates: [...new Set([...item.candidates, input.selectedValue])],
      certainty: 'confirmed' as const,
      holdCode: undefined,
    }
    : { ...item });
  const symbols = current.evidenceGraph.symbols.map((item) => item.displayId === input.targetDisplayId
    ? {
      ...item,
      confirmedType: input.selectedValue,
      typeCandidates: [...new Set([...item.typeCandidates, input.selectedValue])],
      rawLabel: input.selectedValue,
      certainty: 'confirmed' as const,
    }
    : { ...item });
  const lines = current.evidenceGraph.lines.map((item) => ({ ...item }));
  const relations = current.pages.flatMap((page) => buildPageRelations(symbols, lines, page.pageIndex));
  const crossPageRelations = reconcileCrossPage(symbols, texts, extractPageRefHits(texts));
  const equipmentLinks = assignPhysicalEquipmentIds(
    symbols,
    crossPageRelations.filter((relation) => relation.status === 'confirmed'),
  );
  for (const symbol of symbols) symbol.equipmentId = equipmentLinks.get(symbol.id);

  const staleCalculations = current.calculations.filter((calculation) =>
    calculation.evidenceIds.some((evidenceId) => targetEvidenceIds.has(evidenceId)));
  const calculations = current.calculations.map((calculation) => staleCalculations.includes(calculation)
    ? {
      ...calculation,
      value: undefined,
      unit: undefined,
      compliant: null,
      receiptHash: undefined,
      note: '사용자 정정으로 입력 근거가 변경되어 해당 페이지 재분석 후 계산해야 합니다.',
    }
    : { ...calculation });
  const unresolved: UnresolvedItem[] = current.unresolvedItems
    .filter((item) => item.displayId !== input.targetDisplayId && item.code !== 'LINE_CONTINUITY_UNCERTAIN')
    .map((item) => ({ ...item }));
  unresolved.push(...findUnboundLineItems(lines, relations));
  for (const relation of crossPageRelations.filter((item) => item.status !== 'confirmed')) {
    const evidence = relation.evidence[0];
    unresolved.push({
      id: `cross-page-${relation.id}`,
      code: 'LINE_CONTINUITY_UNCERTAIN',
      displayId: relation.displayId,
      pageIndex: evidence?.pageIndex ?? relation.fromPage,
      bounds: evidence?.bounds ?? { x: 0, y: 0, w: 1, h: 1 },
      candidates: [relation.fromRef, relation.toRef],
      note: `페이지 간 관계를 확정하지 못했습니다: ${relation.reason ?? relation.status}`,
    });
  }
  if (staleCalculations.length > 0) {
    unresolved.push({
      id: `correction-reanalysis-${randomUUID()}`,
      code: 'CORRECTION_REANALYSIS_REQUIRED',
      displayId: input.targetDisplayId,
      pageIndex: targetPage,
      bounds: textTarget?.evidence[0]?.bounds ?? symbolTarget?.evidence[0]?.bounds ?? { x: 0, y: 0, w: 1, h: 1 },
      recommendedUpload: input.sourceAvailable ? undefined : {
        note: '보안을 위해 완료 시 임시 원본이 삭제되었습니다. 계산을 다시 연결하려면 같은 원본을 다시 올려주세요.',
      },
      note: input.sourceAvailable
        ? '정정된 근거를 사용한 전기 계산과 제안을 갱신하려면 이 페이지만 다시 분석해야 합니다.'
        : '정격값과 수량은 즉시 갱신했지만, 원본 근거를 사용하는 전기 계산은 원본 재업로드 후 다시 연결해야 합니다.',
    });
  }
  const equipmentCounts = buildEquipmentCounts(symbols, equipmentLinks, crossPageRelations, unresolved);
  const ratedValues = extractRatedValues(texts, symbols);
  const recommendations = buildRecommendations({
    symbols,
    relations,
    calculations,
    unresolved,
    hasGroundPath: lines.some((line) => line.lineKind === 'ground' && line.certainty === 'confirmed'),
    coverageEvidenceIds: current.coverageLedger.regions.flatMap((region) =>
      (region.roleCalls['coverage-auditor'] ?? []).filter((call) => call.success).map((call) => call.callId)),
  });
  const affectedEntityIds = [...new Set([
    input.targetDisplayId,
    ...staleCalculations.map((calculation) => calculation.id),
    ...relations.filter((relation) => relation.from === symbolTarget?.id || relation.to === symbolTarget?.id).map((relation) => relation.displayId),
  ])];
  const correction: UserCorrection = {
    correctionId: `corr-${randomUUID()}`,
    targetDisplayId: input.targetDisplayId,
    originalCandidates: textTarget?.candidates ?? symbolTarget?.typeCandidates ?? [],
    selectedValue: input.selectedValue,
    correctedAt: new Date().toISOString(),
    correctedBy: input.correctedBy,
    affectedEntityIds,
    goldenEligible: false,
  };
  const needsReanalysis = staleCalculations.length > 0;
  const pages = current.pages.map((page) => needsReanalysis && page.pageIndex === targetPage
    ? { ...page, status: 'failed' as const, error: 'CORRECTION_REANALYSIS_REQUIRED' }
    : { ...page });
  const document = buildDrawingDocumentV3({
    documentHash: current.documentHash,
    documentPageCount: current.pageCount,
    jobStatus: needsReanalysis ? 'PARTIAL' : current.jobStatus,
    requestedPages: current.requestedPages,
    pages,
    coverageLedger: current.coverageLedger,
    evidenceGraph: { symbols, lines, texts, relations },
    crossPageRelations,
    equipmentCounts,
    ratedValues,
    calculations,
    recommendations,
    unresolvedItems: unresolved,
    userCorrections: [...current.userCorrections, correction],
    verificationExtra: {
      verified95: false,
      productionFingerprint: current.verification.productionFingerprint,
    },
  });
  return { ...document, createdAt: current.createdAt };
}
