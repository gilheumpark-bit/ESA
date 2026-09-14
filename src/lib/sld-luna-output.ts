import { SLD_COMPONENT_TYPES } from '@/lib/sld-component-types';
import type { SLDAnalysis, SLDComponent, SLDConnection } from '@/lib/sld-recognition';

export const LUNA_REDUCED_SCOPE_WARNING = 'LUNA_FAST_PATH_REDUCED_SCOPE';
export const LUNA_RESPONSE_LIMIT = 1024 * 1024;
const MAX_COMPONENTS = 512;
const MAX_CONNECTIONS = 2048;
const COMPONENT_TEXT = ['label', 'rating', 'voltage', 'current'] as const;
const CONNECTION_TEXT = ['cableType', 'length', 'conductorSize'] as const;
const textSchema = { type: ['string', 'null'] };
const componentProperties = {
  id: { type: 'string' },
  type: { type: 'string', enum: [...SLD_COMPONENT_TYPES] },
  ...Object.fromEntries(COMPONENT_TEXT.map((key) => [key, textSchema])),
  position: {
    type: 'object',
    properties: {
      x: { type: 'number', minimum: 0, maximum: 100 },
      y: { type: 'number', minimum: 0, maximum: 100 },
    },
    required: ['x', 'y'], additionalProperties: false,
  },
};
const connectionProperties = {
  id: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
  ...Object.fromEntries(CONNECTION_TEXT.map((key) => [key, textSchema])),
};
const properties = {
  sheetKind: { type: 'string', enum: ['sld', 'non-electrical', 'unknown'] },
  components: {
    type: 'array', items: {
      type: 'object', properties: componentProperties,
      required: Object.keys(componentProperties), additionalProperties: false,
    },
  },
  connections: {
    type: 'array', items: {
      type: 'object', properties: connectionProperties,
      required: Object.keys(connectionProperties), additionalProperties: false,
    },
  },
  systemVoltage: textSchema, systemType: textSchema,
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  rawDescription: { type: 'string' },
};
export const LUNA_SLD_SCHEMA = {
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
};

export function lunaError(code: string): Error {
  return new Error(`[ESA-SLD] ${code}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function idOf(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value.trim())
    ? value.trim() : undefined;
}

function duplicateIds(records: unknown[]): Set<string> {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const record of records) {
    const id = isRecord(record) ? idOf(record.id) : undefined;
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}

function checkExtraFields(record: Record<string, unknown>, allowed: object, warnings: Set<string>): void {
  if (Object.keys(record).some((key) => !Object.hasOwn(allowed, key))) {
    warnings.add('LUNA_UNEXPECTED_FIELDS_DROPPED');
  }
}

function readTextFields(record: Record<string, unknown>, keys: readonly string[], warnings: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.length <= 512) result[key] = value;
    else warnings.add('LUNA_INVALID_FIELDS_DROPPED');
  }
  return result;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function hasDisconnectedGraph(components: SLDComponent[], connections: SLDConnection[]): boolean {
  if (components.length < 2) return false;
  const neighbors = new Map(components.map((component) => [component.id, [] as string[]]));
  for (const edge of connections) {
    neighbors.get(edge.from)?.push(edge.to);
    neighbors.get(edge.to)?.push(edge.from);
  }
  const visited = new Set<string>(), pending = [components[0].id];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(neighbors.get(id) ?? []).filter((next) => !visited.has(next)));
  }
  return visited.size !== components.length;
}

/** Validate complete JSON, then explicitly project allowed fields. Never repair
 * incomplete JSON, infer safety inputs, or accept model-authored evidence IDs. */
export function parseLunaOutput(text: string, truncated = false): SLDAnalysis {
  if (Buffer.byteLength(text, 'utf8') > LUNA_RESPONSE_LIMIT) throw lunaError('LUNA_RESPONSE_LIMIT');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw lunaError('LUNA_INVALID_OUTPUT'); }
  if (!isRecord(raw) || !Array.isArray(raw.components) || !Array.isArray(raw.connections)
    || typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence)
    || raw.confidence < 0 || raw.confidence > 1
    || typeof raw.rawDescription !== 'string' || raw.rawDescription.length > 4000) {
    throw lunaError('LUNA_INVALID_OUTPUT');
  }
  if (raw.components.length > MAX_COMPONENTS || raw.connections.length > MAX_CONNECTIONS) {
    throw lunaError('LUNA_RESPONSE_LIMIT');
  }
  // Older compact responses did not contain sheetKind; that is unknown, not SLD evidence.
  const sheetKind = raw.sheetKind ?? 'unknown';
  if (typeof sheetKind !== 'string' || !['sld', 'non-electrical', 'unknown'].includes(sheetKind)
    || (sheetKind === 'non-electrical' && (raw.components.length > 0 || raw.connections.length > 0))) {
    throw lunaError('LUNA_INVALID_OUTPUT');
  }
  const warnings = new Set([LUNA_REDUCED_SCOPE_WARNING]);
  checkExtraFields(raw, properties, warnings);
  if (sheetKind === 'unknown') warnings.add('LUNA_SHEET_KIND_UNVERIFIED');
  const duplicateComponents = duplicateIds(raw.components);
  const components: SLDComponent[] = [];
  for (const record of raw.components) {
    const id = isRecord(record) ? idOf(record.id) : undefined;
    if (!isRecord(record) || !id || duplicateComponents.has(id)
      || typeof record.type !== 'string' || record.type.length > 128
      || !isRecord(record.position) || !isCoordinate(record.position.x) || !isCoordinate(record.position.y)) {
      warnings.add('LUNA_INVALID_RECORDS_DROPPED');
      continue;
    }
    checkExtraFields(record, componentProperties, warnings);
    checkExtraFields(record.position, componentProperties.position.properties, warnings);
    const type = SLD_COMPONENT_TYPES.find((candidate) => candidate === record.type) ?? 'unknown';
    if (type === 'unknown') warnings.add('LUNA_TYPE_REVIEW_REQUIRED');
    components.push({
      id, type, ...readTextFields(record, COMPONENT_TEXT, warnings),
      position: { x: record.position.x, y: record.position.y },
    });
  }
  const componentIds = new Set(components.map((component) => component.id));
  const duplicateConnections = duplicateIds(raw.connections);
  const connections: SLDConnection[] = [];
  for (const record of raw.connections) {
    const id = isRecord(record) ? idOf(record.id) : undefined;
    const from = isRecord(record) ? idOf(record.from) : undefined;
    const to = isRecord(record) ? idOf(record.to) : undefined;
    if (!isRecord(record) || !id || duplicateConnections.has(id) || !from || !to
      || from === to || !componentIds.has(from) || !componentIds.has(to)) {
      warnings.add('LUNA_INVALID_RECORDS_DROPPED');
      continue;
    }
    checkExtraFields(record, connectionProperties, warnings);
    connections.push({ id, from, to, ...readTextFields(record, CONNECTION_TEXT, warnings) });
  }
  const system = readTextFields(raw, ['systemVoltage', 'systemType'], warnings);
  if (hasDisconnectedGraph(components, connections)) warnings.add('LUNA_TOPOLOGY_REVIEW_REQUIRED');
  if (sheetKind === 'non-electrical') warnings.add('LUNA_NO_ELECTRICAL_SYMBOLS');
  if (truncated) warnings.add('LUNA_OUTPUT_TRUNCATED');
  const partial = truncated || [...warnings].some((warning) => warning.endsWith('_DROPPED'));
  return {
    components, connections, ...system, suggestedCalculations: [],
    confidence: components.length === 0 ? 0 : partial ? Math.min(raw.confidence, 0.5) : raw.confidence,
    rawDescription: raw.rawDescription,
    ...(partial ? { partial: true } : {}), warnings: [...warnings],
  };
}
