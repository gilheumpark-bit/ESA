/** A numeric reading does not establish its equipment owner or engineering meaning. */
export interface RatedQuantity { value: number; unit: string; offset: number; end: number }

// Longest complete units first. Never read kVA as kV or a suffix of a damaged number.
const QUANTITY = /(?<![\p{L}\p{N}.,+\-])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(MVAR|kVAR|kVA|MVA|kVL|kV|kA|kW|MW|mm²|mm2|A|V)(?![\p{L}\p{N}])/giu;
export function parseRatedQuantities(raw: string): RatedQuantity[] {
  const quantities: RatedQuantity[] = [];
  for (const match of raw.matchAll(QUANTITY)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(value)) quantities.push({ value, unit: match[2], offset: match.index, end: match.index + match[0].length });
  }
  return quantities;
}
export function quantityVolts(quantity: RatedQuantity): number | undefined {
  const unit = quantity.unit.toLowerCase();
  const value = unit === 'kv' ? quantity.value * 1000 : unit === 'v' ? quantity.value : undefined;
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}
