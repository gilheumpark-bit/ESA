type SymbolPosition = {
  id: string;
  bounds: { page: number; x: number; y: number };
};

type LinePosition = {
  id: string;
  pages: readonly number[];
  path: readonly { x: number; y: number }[];
};

export interface EvidenceNumbers {
  symbols: Record<string, string>;
  lines: Record<string, string>;
}

const EQUIPMENT_NAMES: Record<string, { abbreviation: string; name: string }> = {
  VCB: { abbreviation: 'VCB', name: '진공차단기' },
  'VACUUM CIRCUIT BREAKER': { abbreviation: 'VCB', name: '진공차단기' },
  ACB: { abbreviation: 'ACB', name: '기중차단기' },
  MCCB: { abbreviation: 'MCCB', name: '배선용차단기' },
  CB: { abbreviation: 'CB', name: '차단기' },
  BREAKER: { abbreviation: 'CB', name: '차단기' },
  TR: { abbreviation: 'TR', name: '변압기' },
  TRANSFORMER: { abbreviation: 'TR', name: '변압기' },
  CT: { abbreviation: 'CT', name: '변류기' },
  PT: { abbreviation: 'PT', name: '계기용변압기' },
  VT: { abbreviation: 'VT', name: '계기용변압기' },
  LA: { abbreviation: 'LA', name: '피뢰기' },
  DS: { abbreviation: 'DS', name: '단로기' },
  ES: { abbreviation: 'ES', name: '접지개폐기' },
  BUS: { abbreviation: 'BUS', name: '모선' },
  CABLE: { abbreviation: 'CABLE', name: '케이블' },
  LINE: { abbreviation: 'LINE', name: '선로' },
  LOAD: { abbreviation: 'LOAD', name: '부하' },
  GEN: { abbreviation: 'GEN', name: '발전기' },
  GENERATOR: { abbreviation: 'GEN', name: '발전기' },
  MOTOR: { abbreviation: 'M', name: '전동기' },
  MCC: { abbreviation: 'MCC', name: '전동기제어반' },
  ATS: { abbreviation: 'ATS', name: '자동절체개폐기' },
  UPS: { abbreviation: 'UPS', name: '무정전전원장치' },
  CAPACITOR: { abbreviation: 'SC', name: '전력용콘덴서' },
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

export function buildEvidenceNumbers(
  symbolInput: readonly SymbolPosition[],
  lineInput: readonly LinePosition[],
): EvidenceNumbers {
  const symbols = [...symbolInput].sort((left, right) => (
    left.bounds.page - right.bounds.page
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || compareText(left.id, right.id)
  ));
  const lines = [...lineInput].sort((left, right) => {
    const leftPoint = left.path[0] ?? { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
    const rightPoint = right.path[0] ?? { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };
    return (left.pages[0] ?? Number.MAX_SAFE_INTEGER) - (right.pages[0] ?? Number.MAX_SAFE_INTEGER)
      || leftPoint.y - rightPoint.y
      || leftPoint.x - rightPoint.x
      || compareText(left.id, right.id);
  });

  return {
    symbols: Object.fromEntries(symbols.map((item, index) => [item.id, `S${String(index + 1).padStart(2, '0')}`])),
    lines: Object.fromEntries(lines.map((item, index) => [item.id, `L${String(index + 1).padStart(2, '0')}`])),
  };
}

export function describeEquipmentType(type: string): string {
  const normalized = type.trim().toUpperCase() || 'UNKNOWN';
  const known = EQUIPMENT_NAMES[normalized];
  return known ? `${known.abbreviation} · ${known.name}` : normalized;
}
