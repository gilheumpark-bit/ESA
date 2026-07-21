import type { RatedValue, SymbolNode, TextNode } from './types-v3';

export function extractRatedValues(texts: TextNode[], symbols: SymbolNode[]): RatedValue[] {
  const values: RatedValue[] = [];
  for (const text of texts) {
    const raw = text.confirmedText ?? text.rawText;
    const match = raw.match(/(\d+(?:\.\d+)?)\s*(kV|V|A|kA|kVA|kW|mm²|mm2)/i);
    if (!match) continue;
    const evidence = text.evidence[0];
    const textCenter = evidence
      ? { x: evidence.bounds.x + evidence.bounds.w / 2, y: evidence.bounds.y + evidence.bounds.h / 2 }
      : undefined;
    const owner = evidence && textCenter
      ? symbols
        .filter((symbol) => symbol.evidence.some((item) => item.pageIndex === evidence.pageIndex))
        .map((symbol) => {
          const bounds = symbol.evidence[0]?.bounds;
          return { symbol, distance: bounds ? Math.hypot(bounds.x + bounds.w / 2 - textCenter.x, bounds.y + bounds.h / 2 - textCenter.y) : Infinity };
        })
        .sort((left, right) => left.distance - right.distance)[0]?.symbol
      : undefined;
    values.push({
      id: `rv-${values.length + 1}`,
      displayId: text.displayId,
      field: match[2].toLowerCase(),
      raw,
      normalized: { value: Number(match[1]), unit: match[2] },
      certainty: text.certainty,
      evidence: text.evidence,
      equipmentId: owner?.equipmentId,
    });
  }
  return values;
}
