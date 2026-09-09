import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';
import { tallyReadings, type DrawingCertainty, type ReadingTally } from './drawing-certainty';

export interface DrawingReadSummary {
  scope: 'observed-records-only';
  groups: Array<{ kind: string; label: string; counts: ReadingTally }>;
  /** Missing historical collections are not observed zeroes. */
  missingGroups: string[];
  /** Undefined means correction history was not present on a legacy document. */
  humanConfirmed?: number;
  unresolvedCauses: Array<{ code: string; count: number }>;
}
/** Derive from current evidence; neither missing collections nor human edits
 * become machine accuracy/coverage. Categories overlap and must not be summed. */
export function summarizeDrawingReadState(document: DrawingDocumentV3): DrawingReadSummary {
  const graph = document.evidenceGraph;
  const corrected = new Map<string, string>();
  for (const correction of document.userCorrections ?? []) {
    if (correction.correctionKind !== 'label') {
      corrected.set(`${correction.correctionKind}:${correction.targetDisplayId}`, correction.selectedValue);
    }
  }
  const humanConfirmed = Array.isArray(document.userCorrections)
    ? (graph?.symbols ?? []).filter((item) => item.certainty === 'confirmed'
      && item.confirmedType !== undefined && corrected.get(`type:${item.displayId}`) === item.confirmedType).length
      + (graph?.texts ?? []).filter((item) => item.certainty === 'confirmed' && item.confirmedText !== undefined
        && corrected.get(`text:${item.displayId}`) === item.confirmedText).length
    : undefined;
  const groups: DrawingReadSummary['groups'] = [], missingGroups: string[] = [];
  const add = (kind: string, label: string, states: DrawingCertainty[] | undefined) => {
    if (states === undefined) missingGroups.push(label);
    else groups.push({ kind, label, counts: tallyReadings(states) });
  };
  add('symbols', '기기 종류', graph?.symbols?.map((item) => item.certainty));
  add('lines', '선로', graph?.lines?.map((item) => item.certainty));
  add('texts', '문자', graph?.texts?.map((item) => item.certainty));
  add('relations', '결선', graph?.relations?.map((item) => item.certainty));
  add('crossPage', '페이지 간 결선', document.crossPageRelations?.map((item) => item.status === 'confirmed' ? 'confirmed' : 'ambiguous'));
  add('ratedValues', '정격값', document.ratedValues?.map((item) => item.certainty));
  const causes = new Map<string, number>();
  for (const item of document.unresolvedItems ?? []) causes.set(item.code, (causes.get(item.code) ?? 0) + 1);
  return { scope: 'observed-records-only', groups, missingGroups, humanConfirmed,
    unresolvedCauses: [...causes].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}
