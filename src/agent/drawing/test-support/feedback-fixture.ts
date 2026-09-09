/** Synthetic vectors for a feedback lifecycle test, not a real-drawing benchmark. */
import { createHash } from 'node:crypto';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { adaptTeamResult } from '../team-result-adapter';
import { deduplicateSymbols } from '../evidence-deduplicator';
import { uncertaintyDocument } from './uncertainty-document';

const pair = (code: number, value: string | number) => `${code}\n${value}\n`;
export function feedbackDxf(offset = 0, changedGeometry = false, blockName = 'ZZ-CUSTOM-7'): string {
  const lines: number[][] = [[0, 0, 10, 0], [10, 0, 10, 6], [10, 6, 0, 6], [0, 6, 0, 0], [2, 2, changedGeometry ? 4 : 8, 4]];
  return pair(0, 'SECTION') + pair(2, 'HEADER') + pair(9, '$ACADVER') + pair(1, 'AC1015') + pair(0, 'ENDSEC')
    + pair(0, 'SECTION') + pair(2, 'BLOCKS') + pair(0, 'BLOCK') + pair(8, '0') + pair(2, blockName) + pair(70, 0)
    + pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(3, blockName)
    + lines.map(([x, y, x2, y2]) => pair(0, 'LINE') + pair(8, '0') + pair(10, x) + pair(20, y) + pair(30, 0) + pair(11, x2) + pair(21, y2) + pair(31, 0)).join('')
    + pair(0, 'ENDBLK') + pair(0, 'ENDSEC') + pair(0, 'SECTION') + pair(2, 'ENTITIES')
    + pair(0, 'INSERT') + pair(8, 'SYMBOL') + pair(2, blockName) + pair(10, 50 + offset) + pair(20, 50) + pair(30, 0)
    + pair(0, 'ENDSEC') + pair(0, 'EOF');
}
export function feedbackDocument() {
  const bytes = feedbackDxf();
  const parsed = parseDxfToSLD(bytes);
  const adapted = adaptTeamResult({ teamId: 'TEAM-SLD', success: true, confidence: 0.9, durationMs: 0,
    components: parsed.components.map((c) => ({ ...c, label: c.label ?? c.id, confidence: 0.9 })), connections: [] },
  { pageIndex: 0, width: 1000, height: 800 });
  const document = uncertaintyDocument();
  document.documentHash = createHash('sha256').update(bytes).digest('hex');
  document.evidenceGraph = { symbols: deduplicateSymbols(adapted.symbols), texts: [], lines: [], relations: [] };
  return document;
}
