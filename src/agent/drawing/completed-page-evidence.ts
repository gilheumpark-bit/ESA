/** Preserve adjudicated evidence when resuming only unfinished pages. */
import type { DrawingDocumentV3, LineNode, SymbolNode, TextNode } from './types-v3';

export interface CompletedPageEvidence {
  symbols: SymbolNode[];
  lines: LineNode[];
  texts: TextNode[];
}

/**
 * A completed page is a checkpoint, not a fresh model observation. Converting
 * its adjudicated nodes back to raw detections drops terminals and alternatives,
 * can downgrade a resolved body/fragment conflict, and changes evidence IDs.
 * Clone nodes so later equipment-ID assignment cannot mutate the saved job.
 */
export function restoreCompletedPageEvidence(
  document: DrawingDocumentV3 | undefined,
  pages: ReadonlySet<number>,
): CompletedPageEvidence {
  if (!document || pages.size === 0) return { symbols: [], lines: [], texts: [] };
  const preserved = <T extends { evidence: Array<{ pageIndex: number }> }>(nodes: T[]): T[] =>
    nodes.filter((node) => node.evidence.length > 0 && node.evidence.every((ref) => pages.has(ref.pageIndex)))
      .map((node) => structuredClone(node));
  return {
    symbols: preserved(document.evidenceGraph.symbols),
    lines: preserved(document.evidenceGraph.lines),
    texts: preserved(document.evidenceGraph.texts),
  };
}
