import type { SpatialEvidenceGraph, SpatialSymbol, SpatialText } from '../vision/spatial-graph';

export type ElectricalField =
  | 'voltage_V'
  | 'current_A'
  | 'capacity_kVA'
  | 'breaking_kA'
  | 'ctRatio'
  | 'cableSpec'
  | 'conductorSize_mm2'
  | 'conductorMaterial'
  | 'length_m'
  | 'phase';

export type ElectricalUnit = 'V' | 'A' | 'kVA' | 'kA' | 'm' | 'mm2' | 'ratio' | 'text' | 'phase' | 'material';

export interface NormalizedSpec {
  readonly drawingHash: string;
  readonly ownerId?: string;
  readonly field: ElectricalField;
  readonly value: number | string;
  readonly unit: ElectricalUnit;
  readonly raw: string;
  readonly evidenceId: string;
  readonly originalEvidenceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly bounds: Readonly<{ x: number; y: number; w: number; h: number; page: number }>;
  readonly confidence: number;
}

export type NormalizationWarningCode =
  | 'HOLD_UNRESOLVED_TEXT_OWNER'
  | 'HOLD_AMBIGUOUS_TEXT_OWNER'
  | 'HOLD_AMBIGUOUS_FIELD_VALUE'
  | 'HOLD_UNSUPPORTED_OR_MALFORMED_VALUE'
  | 'DUPLICATE_OCR_SPEC'
  | 'GRAPH_CONFLICT';

export interface NormalizationWarning {
  readonly code: NormalizationWarningCode;
  readonly evidenceId?: string;
  readonly field?: ElectricalField;
  readonly page?: number;
  readonly detail?: string;
}

export interface NormalizedElectricalGraph {
  readonly graph: SpatialEvidenceGraph;
  readonly drawingHash: string;
  readonly specs: readonly NormalizedSpec[];
  readonly warnings: readonly NormalizationWarning[];
}

const MAX_FIELDS_PER_TEXT = 16;
const MAX_SPECS = 20_000;
const MAX_WARNINGS = 20_000;
const OWNER_DISTANCE = 80;
const NUMBER = '[-+]?\\d+(?:[.,]\\d+)*';
const CABLE_FAMILY = /(?:^|[^A-Z0-9-])(F-?CV|CV|XLPE)(?:$|[^A-Z0-9-])/i;

type MutableSpec = {
  drawingHash: string;
  ownerId?: string;
  field: ElectricalField;
  value: number | string;
  unit: ElectricalUnit;
  raw: string;
  evidenceId: string;
  originalEvidenceIds: string[];
  sourceIds: string[];
  bounds: { x: number; y: number; w: number; h: number; page: number };
  confidence: number;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function cloneGraph(graph: SpatialEvidenceGraph): SpatialEvidenceGraph {
  const clone = JSON.parse(JSON.stringify(graph)) as SpatialEvidenceGraph;
  clone.symbols.sort((left, right) => left.bounds.page - right.bounds.page || left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x || left.id.localeCompare(right.id));
  clone.lines.sort((left, right) => left.id.localeCompare(right.id));
  clone.texts.sort((left, right) => left.bounds.page - right.bounds.page || left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x || left.id.localeCompare(right.id));
  clone.junctions.sort((left, right) => left.page - right.page || left.id.localeCompare(right.id));
  clone.crossovers.sort((left, right) => left.page - right.page || left.id.localeCompare(right.id));
  clone.edges.sort((left, right) => left.id.localeCompare(right.id));
  clone.textLinks.sort((left, right) => left.id.localeCompare(right.id));
  clone.conflicts.sort((left, right) => left.localeCompare(right));
  return clone;
}

function normalizeToken(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/／/g, '/')
    .replace(/㎟/g, 'mm2')
    .replace(/mm²/gi, 'mm2')
    .replace(/sq\.?/gi, 'sq')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(token: string): number | undefined {
  const value = token.replace(/\s/g, '');
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(value)) return undefined;
  const unsigned = value.startsWith('-') || value.startsWith('+') ? value.slice(1) : value;
  const sign = value.startsWith('-') ? '-' : '';
  const dots = [...unsigned.matchAll(/\./g)].map((match) => match.index ?? 0);
  const commas = [...unsigned.matchAll(/,/g)].map((match) => match.index ?? 0);
  let canonical: string;
  if (dots.length > 0 && commas.length > 0) {
    const decimalIndex = Math.max(dots[dots.length - 1], commas[commas.length - 1]);
    canonical = unsigned
      .split('')
      .filter((character, index) => (character !== '.' && character !== ',') || index === decimalIndex)
      .join('')
      .replace(/[.,]/, '.');
  } else if (commas.length > 0) {
    const tail = unsigned.slice((commas[commas.length - 1] ?? -1) + 1);
    canonical = tail.length <= 2
      ? unsigned.replace(/,/g, (match, index) => index === (commas[commas.length - 1] ?? -1) ? '.' : '')
      : unsigned.replace(/,/g, '');
  } else if (dots.length > 0) {
    const tail = unsigned.slice((dots[dots.length - 1] ?? -1) + 1);
    canonical = dots.length > 1 && tail.length === 3 ? unsigned.replace(/\./g, '') : unsigned.replace(/\.(?=.*\.)/g, '');
  } else {
    canonical = unsigned;
  }
  const parsed = Number(`${sign}${canonical}`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function overlaps(left: { x: number; y: number; w: number; h: number }, right: { x: number; y: number; w: number; h: number }): boolean {
  return left.x < right.x + right.w && right.x < left.x + left.w && left.y < right.y + right.h && right.y < left.y + left.h;
}

function sortedUnion(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])].sort((a, b) => a.localeCompare(b));
}

function normalizedText(raw: string): string {
  return normalizeToken(raw).toLocaleLowerCase('en-US');
}

function addWarning(warnings: NormalizationWarning[], warning: NormalizationWarning): void {
  if (warnings.length >= MAX_WARNINGS) throw new Error('normalization warning budget exceeded');
  const key = `${warning.code}\u0000${warning.evidenceId ?? ''}\u0000${warning.field ?? ''}\u0000${warning.page ?? ''}\u0000${warning.detail ?? ''}`;
  if (!warnings.some((item) => `${item.code}\u0000${item.evidenceId ?? ''}\u0000${item.field ?? ''}\u0000${item.page ?? ''}\u0000${item.detail ?? ''}` === key)) warnings.push(warning);
}

function candidateTypes(symbol: SpatialSymbol): string {
  return [...symbol.typeCandidates, symbol.rawLabel ?? ''].join(' ').toUpperCase();
}

function compatible(field: ElectricalField, symbol: SpatialSymbol): boolean {
  const types = candidateTypes(symbol);
  if (field === 'capacity_kVA') return /\b(TR|TRANSFORMER)\b/.test(types);
  if (field === 'ctRatio') return /\bCT\b/.test(types);
  if (field === 'cableSpec' || field === 'length_m' || field === 'conductorSize_mm2' || field === 'conductorMaterial') return /\b(CABLE|LINE)\b/.test(types);
  if (field === 'phase') return false;
  return /\b(VCB|ACB|MCCB|ELB|CB|SWITCH|TR|TRANSFORMER)\b/.test(types);
}

function ownerFor(spec: MutableSpec, graph: SpatialEvidenceGraph, warnings: NormalizationWarning[]): void {
  if (spec.field === 'phase') return;
  const centerX = spec.bounds.x + spec.bounds.w / 2;
  const centerY = spec.bounds.y + spec.bounds.h / 2;
  const candidates = graph.symbols.filter((symbol) => {
    if (symbol.bounds.page !== spec.bounds.page || !compatible(spec.field, symbol)) return false;
    const symbolX = symbol.bounds.x + symbol.bounds.w / 2;
    const symbolY = symbol.bounds.y + symbol.bounds.h / 2;
    return Math.hypot(centerX - symbolX, centerY - symbolY) <= OWNER_DISTANCE;
  });
  if (candidates.length === 1) {
    spec.ownerId = candidates[0].id;
  } else if (candidates.length === 0) {
    addWarning(warnings, { code: 'HOLD_UNRESOLVED_TEXT_OWNER', evidenceId: spec.evidenceId, field: spec.field, page: spec.bounds.page });
  } else {
    addWarning(warnings, { code: 'HOLD_AMBIGUOUS_TEXT_OWNER', evidenceId: spec.evidenceId, field: spec.field, page: spec.bounds.page, detail: `AMBIGUOUS_TEXT_OWNER:${spec.evidenceId}` });
  }
}

function readMatches(raw: string, pattern: RegExp, unitScale: Record<string, number>, text: SpatialText, field: ElectricalField, occupied: Array<{ start: number; end: number }>, warnings: NormalizationWarning[]): Array<{ value: number; start: number; end: number }> {
  const matches: Array<{ value: number; start: number; end: number }> = [];
  for (const match of raw.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupied.some((span) => start < span.end && end > span.start)) continue;
    const number = parseNumber(match[1]);
    const multiplier = unitScale[match[2].toLowerCase()];
    if (number === undefined || multiplier === undefined || number <= 0) {
      addWarning(warnings, { code: 'HOLD_UNSUPPORTED_OR_MALFORMED_VALUE', evidenceId: text.id, field, page: text.bounds.page });
      continue;
    }
    matches.push({ value: number * multiplier, start, end });
  }
  return matches;
}

function addUniqueNumeric(specs: MutableSpec[], warnings: NormalizationWarning[], text: SpatialText, field: ElectricalField, unit: ElectricalUnit, values: readonly number[]): void {
  const distinct = [...new Set(values.map((value) => String(value)))].map(Number);
  if (distinct.length > 1) {
    addWarning(warnings, { code: 'HOLD_AMBIGUOUS_FIELD_VALUE', evidenceId: text.id, field, page: text.bounds.page });
    return;
  }
  if (distinct.length === 1) addSpec(specs, text, field, distinct[0], unit);
}

function addSpec(specs: MutableSpec[], text: SpatialText, field: ElectricalField, value: number | string, unit: ElectricalUnit): void {
  if (specs.length >= MAX_SPECS) throw new Error('normalization spec budget exceeded');
  specs.push({
    drawingHash: DRAWING_HASH_PLACEHOLDER,
    field,
    value,
    unit,
    raw: text.raw,
    evidenceId: text.id,
    originalEvidenceIds: [...text.originalEvidenceIds].sort((a, b) => a.localeCompare(b)),
    sourceIds: [...text.sourceIds].sort((a, b) => a.localeCompare(b)),
    bounds: { ...text.bounds },
    confidence: text.confidence,
  });
}

const DRAWING_HASH_PLACEHOLDER = '__drawing_hash__';

function parseText(text: SpatialText, warnings: NormalizationWarning[]): MutableSpec[] {
  const raw = normalizeToken(text.raw);
  const specs: MutableSpec[] = [];
  const occupied: Array<{ start: number; end: number }> = [];
  const ct = new RegExp(`(?:\\bCT\\b|변류기)\\s*(${NUMBER})\\s*\\/\\s*(${NUMBER})(?:\\s*A)?`, 'gi');
  const ctValues: string[] = [];
  for (const match of raw.matchAll(ct)) {
    const first = parseNumber(match[1]);
    const second = parseNumber(match[2]);
    const start = match.index ?? 0;
    occupied.push({ start, end: start + match[0].length });
    if (first === undefined || second === undefined || first <= 0 || second <= 0) {
      addWarning(warnings, { code: 'HOLD_UNSUPPORTED_OR_MALFORMED_VALUE', evidenceId: text.id, field: 'ctRatio', page: text.bounds.page });
    } else {
      ctValues.push(`${first}/${second}`);
    }
  }
  if (new Set(ctValues).size > 1) addWarning(warnings, { code: 'HOLD_AMBIGUOUS_FIELD_VALUE', evidenceId: text.id, field: 'ctRatio', page: text.bounds.page });
  else if (ctValues.length === 1) addSpec(specs, text, 'ctRatio', ctValues[0], 'ratio');

  const voltage = readMatches(raw, new RegExp(`(${NUMBER})\\s*(kV|V)(?![A-Za-z])`, 'gi'), { kv: 1000, v: 1 }, text, 'voltage_V', occupied, warnings);
  const capacity = readMatches(raw, new RegExp(`(${NUMBER})\\s*(MVA|kVA)(?![A-Za-z])`, 'gi'), { mva: 1000, kva: 1 }, text, 'capacity_kVA', occupied, warnings);
  const breaking = readMatches(raw, new RegExp(`(${NUMBER})\\s*(kA)(?![A-Za-z])`, 'gi'), { ka: 1 }, text, 'breaking_kA', occupied, warnings);
  const current = readMatches(raw, new RegExp(`(${NUMBER})\\s*(A)(?![A-Za-z])`, 'gi'), { a: 1 }, text, 'current_A', occupied, warnings);
  addUniqueNumeric(specs, warnings, text, 'voltage_V', 'V', voltage.map((item) => item.value));
  addUniqueNumeric(specs, warnings, text, 'capacity_kVA', 'kVA', capacity.map((item) => item.value));
  addUniqueNumeric(specs, warnings, text, 'breaking_kA', 'kA', breaking.map((item) => item.value));
  addUniqueNumeric(specs, warnings, text, 'current_A', 'A', current.map((item) => item.value));

  const cableContext = CABLE_FAMILY.test(raw);
  if (cableContext) addSpec(specs, text, 'cableSpec', raw, 'text');
  const sizes = readMatches(raw, new RegExp(`(${NUMBER})\\s*(mm2|sq)(?![A-Za-z])`, 'gi'), { mm2: 1, sq: 1 }, text, 'conductorSize_mm2', occupied, warnings);
  if (cableContext) addUniqueNumeric(specs, warnings, text, 'conductorSize_mm2', 'mm2', sizes.map((item) => item.value));
  const materials = [...raw.matchAll(/\b(Cu|Copper|동|Al|Aluminium|알루미늄)\b/gi)].map((match) => /^(Cu|Copper|동)$/i.test(match[1]) ? 'Cu' : 'Al');
  if (cableContext && new Set(materials).size === 1) addSpec(specs, text, 'conductorMaterial', materials[0], 'material');
  if (cableContext && new Set(materials).size > 1) addWarning(warnings, { code: 'HOLD_AMBIGUOUS_FIELD_VALUE', evidenceId: text.id, field: 'conductorMaterial', page: text.bounds.page });
  const lengths = readMatches(raw, new RegExp(`(${NUMBER})\\s*(미터|m)(?!m|m2|[A-Za-z])`, 'gi'), { '미터': 1, m: 1 }, text, 'length_m', occupied, warnings);
  addUniqueNumeric(specs, warnings, text, 'length_m', 'm', lengths.map((item) => item.value));
  const phases = [...raw.matchAll(/(?:^|\s)(1|3)\s*(?:Ø|φ|상)/gi)].map((match) => Number(match[1]));
  addUniqueNumeric(specs, warnings, text, 'phase', 'phase', phases);

  if (ctValues.length + voltage.length + capacity.length + breaking.length + current.length + sizes.length + lengths.length + phases.length + (cableContext ? 1 : 0) + materials.length > MAX_FIELDS_PER_TEXT) {
    throw new Error('parsed field budget exceeded');
  }
  return specs;
}

function dedupe(specs: MutableSpec[], warnings: NormalizationWarning[]): MutableSpec[] {
  const ordered = [...specs].sort(compareSpecs);
  const output: MutableSpec[] = [];
  for (const spec of ordered) {
    const duplicate = output.find((existing) =>
      existing.bounds.page === spec.bounds.page
      && existing.field === spec.field
      && existing.unit === spec.unit
      && String(existing.value) === String(spec.value)
      && normalizedText(existing.raw) === normalizedText(spec.raw)
      && (overlaps(existing.bounds, spec.bounds) || existing.originalEvidenceIds.some((id) => spec.originalEvidenceIds.includes(id))),
    );
    if (!duplicate) {
      output.push(spec);
      continue;
    }
    const canonical = duplicate.evidenceId.localeCompare(spec.evidenceId) <= 0 ? duplicate : spec;
    const merged = canonical === duplicate ? duplicate : spec;
    const other = canonical === duplicate ? spec : duplicate;
    merged.evidenceId = canonical.evidenceId;
    merged.raw = canonical.raw;
    merged.bounds = { ...canonical.bounds };
    merged.confidence = canonical.confidence;
    merged.ownerId = canonical.ownerId;
    merged.originalEvidenceIds = sortedUnion(duplicate.originalEvidenceIds, spec.originalEvidenceIds);
    merged.sourceIds = sortedUnion(duplicate.sourceIds, spec.sourceIds);
    if (merged !== duplicate) output[output.indexOf(duplicate)] = merged;
    addWarning(warnings, { code: 'DUPLICATE_OCR_SPEC', evidenceId: merged.evidenceId, field: merged.field, page: merged.bounds.page, detail: other.evidenceId });
  }
  return output;
}

function compareSpecs(left: Pick<NormalizedSpec, 'bounds' | 'field' | 'evidenceId'>, right: Pick<NormalizedSpec, 'bounds' | 'field' | 'evidenceId'>): number {
  return left.bounds.page - right.bounds.page
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || left.field.localeCompare(right.field)
    || left.evidenceId.localeCompare(right.evidenceId);
}

function compareWarnings(left: NormalizationWarning, right: NormalizationWarning): number {
  return left.code.localeCompare(right.code)
    || (left.evidenceId ?? '').localeCompare(right.evidenceId ?? '')
    || (left.field ?? '').localeCompare(right.field ?? '')
    || (left.detail ?? '').localeCompare(right.detail ?? '');
}

export function normalizeElectricalGraph(graph: SpatialEvidenceGraph): NormalizedElectricalGraph {
  const warnings: NormalizationWarning[] = [];
  for (const conflict of [...graph.conflicts].sort((a, b) => a.localeCompare(b))) addWarning(warnings, { code: 'GRAPH_CONFLICT', detail: conflict });
  const parsed = graph.texts
    .slice()
    .sort((left, right) => left.bounds.page - right.bounds.page || left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x || left.id.localeCompare(right.id))
    .flatMap((item) => parseText(item, warnings));
  for (const spec of parsed) {
    spec.drawingHash = graph.drawingHash;
    ownerFor(spec, graph, warnings);
  }
  const specs = dedupe(parsed, warnings).sort(compareSpecs);
  return deepFreeze({
    graph: cloneGraph(graph),
    drawingHash: graph.drawingHash,
    specs: specs.map((spec) => ({ ...spec, originalEvidenceIds: [...spec.originalEvidenceIds], sourceIds: [...spec.sourceIds], bounds: { ...spec.bounds } })),
    warnings: [...warnings].sort(compareWarnings),
  });
}
