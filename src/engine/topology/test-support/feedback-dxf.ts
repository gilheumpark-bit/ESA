import { parseDxfToSLD } from '../dxf-parser';
import { adaptTeamResult } from '@/agent/drawing/team-result-adapter';
import { deduplicateSymbols } from '@/agent/drawing/evidence-deduplicator';
import { uncertaintyDocument } from '@/agent/drawing/test-support/uncertainty-document';
import type { TeamResult } from '@/agent/teams/types';

export function feedbackDxf(name = 'CUSTOM-UI', triangle = false, copies = 1, position = 0, rotation = 0): string {
  const points = triangle ? [[0, 0], [20, 0], [10, 20]] : [[0, 0], [20, 0], [20, 20], [0, 20]];
  const lines = points.map((from, i) => {
    const to = points[(i + 1) % points.length];
    return `0\nLINE\n8\n0\n10\n${from[0]}\n20\n${from[1]}\n30\n0\n11\n${to[0]}\n21\n${to[1]}\n31\n0\n`;
  }).join('');
  const inserts = Array.from({ length: copies }, (_, i) => `0\nINSERT\n8\n0\n2\n${name}\n10\n${position + i * 100}\n20\n${position}\n30\n0\n41\n1\n42\n1\n50\n${rotation}\n`).join('');
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n8\n0\n2\n${name}\n70\n0\n10\n0\n20\n0\n30\n0\n3\n${name}\n1\n\n${lines}0\nENDBLK\n8\n0\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${inserts}0\nENDSEC\n0\nEOF\n`;
}

/** Actual parser -> production adapter -> production deduplication. Remaining
 * document metadata is a fixture; this is not a provider-accuracy evaluation. */
export function feedbackDocument(source = feedbackDxf()) {
  const parsed = parseDxfToSLD(source);
  const team = { teamId: 'TEAM-SLD', success: true, confidence: 0.9, durationMs: 0,
    components: parsed.components.map((item) => ({ ...item, confidence: 0.9 })), connections: [],
    calculations: [], suggestions: [], findings: [], summary: 'Synthetic feedback transport fixture' } as unknown as TeamResult;
  const raw = adaptTeamResult(team, 0);
  const document = uncertaintyDocument();
  document.title = '피드백 재사용 합성 도면';
  document.evidenceGraph.symbols = deduplicateSymbols(raw.symbols);
  document.unresolvedItems = document.evidenceGraph.symbols.map((item) => ({ id: `unread-${item.id}`, code: 'UNREADABLE_SYMBOL' as const,
    displayId: item.displayId, pageIndex: 0, bounds: item.evidence[0].bounds, candidates: ['breaker', 'fuse'], note: '미등록 회사 심볼' }));
  document.verification = { ...document.verification, claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL'] };
  return document;
}
