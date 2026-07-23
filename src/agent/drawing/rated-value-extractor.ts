import type { RatedValue, SymbolNode, TextNode } from './types-v3';

// 단위 정규식(2026-07-21 버그 사냥 수리): 구판 `(kV|V|A|kA|kVA|kW|...)`은
// 교대 최좌측 매칭이라 "1000kVA"에서 kV를 먼저 물어 변압기 용량을 전압으로,
// "22,900V"의 콤마를 못 읽어 22.9kV를 900V로 붕괴시켰다(라이브 재현·drawing-jobs
// 파이프라인 소비). 정본 spec-text.ts와 같은 규율로 정렬한다:
//  1) 긴 단위를 앞에(MVAR·kVAR·kVA·MVA·kA·kW·kV 순) — 최장일치
//  2) 뒤에 글자가 이어지면 그 단위가 아님 (?![A-Za-z]) — "kV"가 "kVA"에 안 물림
//  3) 천단위 콤마 허용, 값 변환 시 제거
const RATED_UNIT = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(MVAR|kVAR|kVA|MVA|kVL|kV|kA|kW|MW|mm²|mm2|A|V)(?![A-Za-z])/i;

export function extractRatedValues(texts: TextNode[], symbols: SymbolNode[]): RatedValue[] {
  const values: RatedValue[] = [];
  for (const text of texts) {
    const raw = text.confirmedText ?? text.rawText;
    const match = raw.match(RATED_UNIT);
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
      normalized: { value: Number(match[1].replace(/,/g, '')), unit: match[2] },
      certainty: text.certainty,
      evidence: text.evidence,
      equipmentId: owner?.equipmentId,
    });
  }
  return values;
}
