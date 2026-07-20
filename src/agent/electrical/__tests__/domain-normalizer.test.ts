import type { SpatialEvidenceGraph, SpatialSymbol, SpatialText } from '../../vision/spatial-graph';
import { normalizeElectricalGraph } from '../domain-normalizer';

const DRAWING_HASH = 'a'.repeat(64);

function bounds(x: number, y = 0, page = 1) {
  return { x, y, w: 20, h: 10, page };
}

function symbol(id: string, type: string, x: number, page = 1): SpatialSymbol {
  return {
    id,
    originalEvidenceId: `sym-evidence:${id}`,
    originalEvidenceIds: [`sym-evidence:${id}`],
    sourceIds: [`source:symbol:${id}`],
    typeCandidates: [type],
    rawLabel: id,
    bounds: bounds(x, 0, page),
    ports: [],
    confidence: 0.9,
  };
}

function text(id: string, raw: string, x: number, y = 0, page = 1): SpatialText {
  return {
    id,
    originalEvidenceId: `text-evidence:${id}`,
    originalEvidenceIds: [`text-evidence:${id}`],
    sourceIds: [`source:text:${id}`],
    raw,
    candidates: [raw],
    bounds: bounds(x, y, page),
    confidence: 0.8,
  };
}

function graph(options: Partial<SpatialEvidenceGraph> = {}): SpatialEvidenceGraph {
  return {
    drawingHash: DRAWING_HASH,
    symbols: [],
    lines: [],
    texts: [],
    junctions: [],
    crossovers: [],
    edges: [],
    textLinks: [],
    conflicts: [],
    ...options,
  };
}

function specsFor(result: ReturnType<typeof normalizeElectricalGraph>, evidenceId: string) {
  return result.specs.filter((spec) => spec.evidenceId === evidenceId);
}

describe('normalizeElectricalGraph', () => {
  it('normalizes mixed Korean and English unit tokens while preserving complete provenance', () => {
    const result = normalizeElectricalGraph(graph({
      symbols: [
        symbol('TR-01', 'TRANSFORMER', 0),
        symbol('VCB-01', 'VCB', 150),
        symbol('CT-01', 'CT', 300),
        symbol('CABLE-01', 'CABLE', 450),
      ],
      texts: [
        text('TEXT-001', 'TR 22.9kV 630kVA', 0),
        text('TEXT-002', 'VCB 25.8kV 630A 12.5kA', 150),
        text('TEXT-003', 'CT 400/5A', 300),
        text('TEXT-004', 'CV 3C 35mm² Cu 120m 3상', 450),
      ],
    }));

    expect(result.drawingHash).toBe(DRAWING_HASH);
    expect(specsFor(result, 'TEXT-001')).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'voltage_V', value: 22900, unit: 'V', ownerId: 'TR-01', raw: 'TR 22.9kV 630kVA' }),
      expect.objectContaining({ field: 'capacity_kVA', value: 630, unit: 'kVA', ownerId: 'TR-01' }),
    ]));
    expect(specsFor(result, 'TEXT-002')).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'voltage_V', value: 25800, unit: 'V', ownerId: 'VCB-01' }),
      expect.objectContaining({ field: 'current_A', value: 630, unit: 'A', ownerId: 'VCB-01' }),
      expect.objectContaining({ field: 'breaking_kA', value: 12.5, unit: 'kA', ownerId: 'VCB-01' }),
    ]));
    expect(specsFor(result, 'TEXT-003')).toEqual([
      expect.objectContaining({ field: 'ctRatio', value: '400/5', unit: 'ratio', ownerId: 'CT-01' }),
    ]);
    expect(specsFor(result, 'TEXT-004')).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'cableSpec', unit: 'text', ownerId: 'CABLE-01' }),
      expect.objectContaining({ field: 'conductorSize_mm2', value: 35, unit: 'mm2', ownerId: 'CABLE-01' }),
      expect.objectContaining({ field: 'conductorMaterial', value: 'Cu', unit: 'material', ownerId: 'CABLE-01' }),
      expect.objectContaining({ field: 'length_m', value: 120, unit: 'm', ownerId: 'CABLE-01' }),
      expect.objectContaining({ field: 'phase', value: 3, unit: 'phase' }),
    ]));
    const voltage = result.specs.find((spec) => spec.field === 'voltage_V' && spec.evidenceId === 'TEXT-001');
    expect(voltage).toMatchObject({
      originalEvidenceIds: ['text-evidence:TEXT-001'],
      sourceIds: ['source:text:TEXT-001'],
      bounds: { x: 0, y: 0, w: 20, h: 10, page: 1 },
      confidence: 0.8,
    });
    expect(voltage?.bounds).not.toBe(graph().texts);
  });

  it('parses locale decimals and refuses ambiguous field values and cross-unit captures', () => {
    const result = normalizeElectricalGraph(graph({
      texts: [
        text('TEXT-010', '22,900V 12,5kA', 0),
        text('TEXT-014', '22.900,5V', 50),
        text('TEXT-011', '630kVA 12.5kA', 100),
        text('TEXT-012', '380V 400V', 200),
        text('TEXT-013', '-10V 0A 3C 35mm²', 300),
      ],
    }));

    expect(specsFor(result, 'TEXT-010')).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'voltage_V', value: 22900, unit: 'V' }),
      expect.objectContaining({ field: 'breaking_kA', value: 12.5, unit: 'kA' }),
    ]));
    expect(specsFor(result, 'TEXT-014')).toEqual([
      expect.objectContaining({ field: 'voltage_V', value: 22900.5, unit: 'V' }),
    ]);
    expect(result.specs.some((spec) => spec.field === 'current_A' && spec.evidenceId === 'TEXT-011')).toBe(false);
    expect(result.specs.some((spec) => spec.field === 'voltage_V' && spec.evidenceId === 'TEXT-011')).toBe(false);
    expect(result.specs.some((spec) => spec.evidenceId === 'TEXT-012' && spec.field === 'voltage_V')).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HOLD_AMBIGUOUS_FIELD_VALUE', evidenceId: 'TEXT-012', field: 'voltage_V' }),
      expect.objectContaining({ code: 'HOLD_UNSUPPORTED_OR_MALFORMED_VALUE', evidenceId: 'TEXT-013' }),
    ]));
    expect(result.specs.some((spec) => spec.field === 'phase' && spec.evidenceId === 'TEXT-013')).toBe(false);
    expect(result.specs.some((spec) => spec.field === 'length_m' && spec.evidenceId === 'TEXT-013')).toBe(false);
  });

  it('uses only one compatible same-page owner and emits unresolved or ambiguous HOLD without tie-breaking', () => {
    const result = normalizeElectricalGraph(graph({
      symbols: [
        symbol('VCB-01', 'VCB', 0),
        symbol('VCB-02', 'VCB', 100),
        symbol('TR-P2', 'TRANSFORMER', 0, 2),
      ],
      texts: [
        text('TEXT-020', '630A', 0),
        text('TEXT-021', '630A', 30),
        text('TEXT-022', '22.9kV', 0, 0, 2),
        text('TEXT-023', '22.9kV', 0, 0, 3),
      ],
    }));

    expect(specsFor(result, 'TEXT-020')).toEqual([
      expect.objectContaining({ field: 'current_A', ownerId: 'VCB-01' }),
    ]);
    expect(specsFor(result, 'TEXT-021')).toEqual([
      expect.objectContaining({ field: 'current_A' }),
    ]);
    expect(specsFor(result, 'TEXT-021')[0]).not.toHaveProperty('ownerId');
    expect(specsFor(result, 'TEXT-022')).toEqual([
      expect.objectContaining({ field: 'voltage_V', ownerId: 'TR-P2' }),
    ]);
    expect(specsFor(result, 'TEXT-023')).toEqual([
      expect.objectContaining({ field: 'voltage_V' }),
    ]);
    expect(specsFor(result, 'TEXT-023')[0]).not.toHaveProperty('ownerId');
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HOLD_AMBIGUOUS_TEXT_OWNER', evidenceId: 'TEXT-021', field: 'current_A' }),
      expect.objectContaining({ code: 'HOLD_UNRESOLVED_TEXT_OWNER', evidenceId: 'TEXT-023', field: 'voltage_V' }),
    ]));
    expect(result.graph.conflicts).toEqual([]);
  });

  it('merges only overlapping duplicate OCR observations with deterministic provenance', () => {
    const result = normalizeElectricalGraph(graph({
      texts: [
        text('TEXT-031', '22.9kV', 0),
        text('TEXT-030', '22.9kV', 1),
        text('TEXT-032', '22.9kV', 300),
      ],
    }));

    const voltages = result.specs.filter((spec) => spec.field === 'voltage_V');
    expect(voltages).toHaveLength(2);
    expect(voltages[0]).toMatchObject({
      evidenceId: 'TEXT-030',
      originalEvidenceIds: ['text-evidence:TEXT-030', 'text-evidence:TEXT-031'],
      sourceIds: ['source:text:TEXT-030', 'source:text:TEXT-031'],
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_OCR_SPEC', evidenceId: 'TEXT-030', field: 'voltage_V' }),
    ]));
  });

  it('forwards graph conflicts, remains deterministic under permutations, and never mutates input evidence', () => {
    const input = graph({
      texts: [text('TEXT-041', '120m', 0), text('TEXT-040', 'CV 3C 35mm² Al', 0)],
      conflicts: ['UNBOUND_LINE_ENDPOINT:LINE-002'],
    });
    const before = JSON.parse(JSON.stringify(input));
    const first = normalizeElectricalGraph(input);
    const second = normalizeElectricalGraph({ ...input, texts: [...input.texts].reverse() });

    expect(input).toEqual(before);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.specs)).toBe(true);
    expect(first.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GRAPH_CONFLICT', detail: 'UNBOUND_LINE_ENDPOINT:LINE-002' }),
    ]));
    expect(first.specs.some((spec) => spec.field === 'conductorMaterial' && spec.value === 'Cu')).toBe(false);
  });

  it('fails closed before an individual text expands beyond the parsed-field budget', () => {
    const raw = Array.from({ length: 17 }, (_, index) => `${index + 1}V`).join(' ');
    expect(() => normalizeElectricalGraph(graph({ texts: [text('TEXT-050', raw, 0)] }))).toThrow('parsed field budget');
  });
});
