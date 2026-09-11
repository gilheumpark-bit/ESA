import { parseDxfToSLD } from '../dxf-parser';
import { describeSymbolShape } from '@/lib/symbol-shape';
import { fingerprintBlock } from '../symbol-library';
import { adaptTeamResult } from '@/agent/drawing/team-result-adapter';
import { deduplicateSymbols } from '@/agent/drawing/evidence-deduplicator';
import { uncertaintyDocument } from '@/agent/drawing/test-support/uncertainty-document';
import type { SLDAnalysis } from '@/lib/sld-recognition';
import type { SymbolLibrary } from '@/lib/symbol-library-contract';
import type { TeamResult } from '@/agent/teams/types';

export function rectangle(width = 20, height = 20) {
  return [
    { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: width, y: 0 } },
    { type: 'LINE', startPoint: { x: width, y: 0 }, endPoint: { x: width, y: height } },
    { type: 'LINE', startPoint: { x: width, y: height }, endPoint: { x: 0, y: height } },
    { type: 'LINE', startPoint: { x: 0, y: height }, endPoint: { x: 0, y: 0 } },
  ];
}
export const approvedShape = () => describeSymbolShape(rectangle())!;
export const variationShape = () => describeSymbolShape(rectangle(20.2))!;
export const classifierLibrary = (): SymbolLibrary => ({ schemaVersion: 1, organization: 'Synthetic Company',
  entries: [{ blockNames: ['ZZ-A91'], deviceType: 'breaker' }] });
function block(name: string, width: number): string {
  const lines = rectangle(width).map((entity) => `0\nLINE\n8\n0\n10\n${entity.startPoint.x}\n20\n${entity.startPoint.y}\n11\n${entity.endPoint.x}\n21\n${entity.endPoint.y}\n`).join('');
  return `0\nBLOCK\n8\n0\n2\n${name}\n70\n0\n10\n0\n20\n0\n30\n0\n3\n${name}\n1\n\n${lines}0\nENDBLK\n8\n0\n`;
}
function insert(name: string, x: number, y: number) { return `0\nINSERT\n8\nFEEDER\n2\n${name}\n10\n${x}\n20\n${y}\n30\n0\n41\n1\n42\n1\n50\n0\n`; }
export function classificationDxf(count = 1, unknownName = 'ZZ-B92'): string {
  let instances = insert('BUS', 0, 1000) + insert('ZZ-A91', 0, 0) + insert('ZZ-A91', 100, 0);
  const xs = [0, 100];
  for (let i = 0; i < count; i++) { xs.push(200 + i * 100); instances += insert(unknownName, 200 + i * 100, 0); }
  for (const x of xs) instances += `0\nLINE\n8\nFEEDER\n10\n${x}\n20\n0\n11\n0\n21\n1000\n`;
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n${block('BUS', 100)}${block('ZZ-A91', 20)}${block(unknownName, 20.2)}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${instances}0\nENDSEC\n0\nEOF\n`;
}
export function parsedClassification(count = 1) { return parseDxfToSLD(classificationDxf(count), { symbolLibrary: classifierLibrary() }); }

/** Real vector parse -> production adapter -> production deduplication. Other
 * document bookkeeping is synthetic, not an independent drawing evaluation. */
export function classificationDocument(analysis: SLDAnalysis = parsedClassification()) {
  const team = { confidence: analysis.confidence, components: analysis.components.map((component) => ({ ...component, confidence: analysis.confidence })),
    connections: analysis.connections, vectorTexts: analysis.sourceTexts } as unknown as TeamResult;
  const adapted = adaptTeamResult(team, { pageIndex: 0, width: 1200, height: 1000, positionSpace: 'source' });
  const document = uncertaintyDocument();
  document.title = '반복 심볼 분류 합성 도면';
  document.evidenceGraph.symbols = deduplicateSymbols(adapted.symbols);
  document.unresolvedItems = document.evidenceGraph.symbols.filter((symbol) => symbol.certainty !== 'confirmed').map((symbol) => ({
    id: `unread-${symbol.id}`, code: 'UNREADABLE_SYMBOL' as const, displayId: symbol.displayId, pageIndex: 0,
    bounds: symbol.evidence[0].bounds, candidates: symbol.typeCandidates, note: '독립 판독 미확정: 분류 결과와 정격·결선 확정은 구분합니다.',
  }));
  document.verification = { ...document.verification, claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL'] };
  return document;
}
export const fingerprint = () => fingerprintBlock(rectangle())!;
