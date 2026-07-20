import type { EvidenceBounds, Point } from './evidence-types';

const MAX_NORMALIZED_COORDINATE = 1000;
const MAX_PAGE = 10_000;
const MAX_DETECTIONS = 10_000;
const MAX_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 4_000;
const MAX_PATH_POINTS = 10_000;
const MAX_PAYLOAD_NODES = 50_000;
const MAX_PAYLOAD_ARRAY_ITEMS = 20_000;
const MAX_PAYLOAD_STRING_CHARS = 200_000;
const MAX_PAYLOAD_DEPTH = 32;

const REVIEW_ROLES = [
  'overview',
  'symbols',
  'connections',
  'text',
  'logic',
  'synthesis',
  'adversary',
] as const;
const LINE_KINDS = ['power', 'bus', 'control', 'ground', 'unknown'] as const;
const LOGIC_TOPICS = [
  'DIRECTION',
  'PROTECTION_CHAIN',
  'VOLTAGE_DOMAIN',
  'DEVICE_IDENTITY',
  'MISSING_RELATION',
] as const;

export type ReviewRole = (typeof REVIEW_ROLES)[number];
export type ReviewBounds = EvidenceBounds & { page: number };

export interface SymbolEvidence {
  id: string;
  sourceId?: string;
  typeCandidates: string[];
  rawLabel: string | null;
  bounds: ReviewBounds;
  ports: Point[];
  confidence: number;
}

export interface LineEvidence {
  id: string;
  sourceId?: string;
  lineKind: (typeof LINE_KINDS)[number];
  path: Point[];
  start: Point;
  end: Point;
  junctions: Point[];
  crossovers: Point[];
  confidence: number;
}

export interface TextEvidence {
  id: string;
  sourceId?: string;
  raw: string;
  candidates: string[];
  bounds: ReviewBounds;
  confidence: number;
}

export interface LogicEvidence {
  id: string;
  sourceId?: string;
  topic: (typeof LOGIC_TOPICS)[number];
  subjectIds: string[];
  attributes?: {
    fromId?: string;
    toId?: string;
    protectedById?: string | null;
    voltageV?: number;
    deviceType?: string;
  };
  statement: string;
  evidenceBounds: ReviewBounds[];
  confidence: number;
}

export interface RoleReviewData {
  symbols?: SymbolEvidence[];
  lines?: LineEvidence[];
  texts?: TextEvidence[];
  logic?: LogicEvidence[];
  warnings: string[];
  confidence: number;
}

export interface RoleReviewEnvelope {
  role: ReviewRole;
  drawingHash: string;
  provider: 'openai' | 'gemini' | 'claude';
  model: string;
  promptVersion: string;
  outputHash: string;
  durationMs: number;
  data: RoleReviewData;
}

type RawRecord = Record<string, unknown>;
type DetectionKey = 'symbols' | 'lines' | 'texts' | 'logic';

const ROLE_COLLECTIONS: Record<ReviewRole, readonly DetectionKey[]> = {
  overview: [],
  symbols: ['symbols'],
  connections: ['lines'],
  text: ['texts'],
  logic: ['logic'],
  synthesis: ['symbols', 'lines', 'texts', 'logic'],
  adversary: ['symbols', 'lines', 'texts', 'logic'],
};

function invalid(role: ReviewRole, message: string): never {
  throw new Error(`Invalid ${role} review output: ${message}`);
}

function asRecord(role: ReviewRole, value: unknown, label: string): RawRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(role, `${label} must be an object.`);
  }

  return value as RawRecord;
}

function assertAllowedKeys(
  role: ReviewRole,
  value: RawRecord,
  label: string,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    invalid(role, `${label} contains an unsupported field.`);
  }
}

function assertPayloadBudget(role: ReviewRole, value: unknown): void {
  const seen = new WeakSet<object>();
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  let arrayItems = 0;
  let stringChars = 0;

  while (stack.length > 0) {
    const current = stack.pop() as { value: unknown; depth: number };
    nodes += 1;
    if (nodes > MAX_PAYLOAD_NODES) {
      invalid(role, 'payload exceeds the cumulative node budget.');
    }
    if (current.depth > MAX_PAYLOAD_DEPTH) {
      invalid(role, 'payload exceeds the maximum nesting depth.');
    }
    if (typeof current.value === 'string') {
      stringChars += current.value.length;
      if (stringChars > MAX_PAYLOAD_STRING_CHARS) {
        invalid(role, 'payload exceeds the cumulative string budget.');
      }
      continue;
    }
    if (!current.value || typeof current.value !== 'object') {
      continue;
    }
    if (seen.has(current.value)) {
      invalid(role, 'payload contains a cycle or shared object reference.');
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      arrayItems += current.value.length;
      if (arrayItems > MAX_PAYLOAD_ARRAY_ITEMS) {
        invalid(role, 'payload exceeds the cumulative array-item budget.');
      }
      for (const item of current.value) {
        stack.push({ value: item, depth: current.depth + 1 });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(current.value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid(role, 'payload contains a non-plain object.');
    }
    for (const key of Object.keys(current.value)) {
      stack.push({ value: (current.value as RawRecord)[key], depth: current.depth + 1 });
    }
  }
}

function boundedString(role: ReviewRole, value: unknown, label: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    return invalid(role, `${label} must be a non-empty bounded string.`);
  }

  return value;
}

function boundedStringArray(
  role: ReviewRole,
  value: unknown,
  label: string,
  minimumLength: number,
): string[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > MAX_DETECTIONS) {
    return invalid(role, `${label} must be a bounded string array.`);
  }

  return value.map((item, index) => boundedString(role, item, `${label}[${index}]`));
}

function parsePoint(role: ReviewRole, value: unknown, label: string): Point {
  const item = asRecord(role, value, label);
  assertAllowedKeys(role, item, label, ['x', 'y']);
  const x = item.x;
  const y = item.y;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > MAX_NORMALIZED_COORDINATE ||
    y < 0 ||
    y > MAX_NORMALIZED_COORDINATE
  ) {
    return invalid(role, `${label} must be a finite normalized point.`);
  }

  return { x, y };
}

function parseBounds(role: ReviewRole, value: unknown, label: string): ReviewBounds {
  const item = asRecord(role, value, label);
  assertAllowedKeys(role, item, label, ['x', 'y', 'w', 'h', 'page']);
  const x = item.x;
  const y = item.y;
  const w = item.w;
  const h = item.h;
  const page = item.page === undefined ? 1 : item.page;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number' ||
    typeof page !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    !Number.isInteger(page) ||
    x < 0 ||
    y < 0 ||
    w <= 0 ||
    h <= 0 ||
    x + w > MAX_NORMALIZED_COORDINATE ||
    y + h > MAX_NORMALIZED_COORDINATE ||
    page < 1 ||
    page > MAX_PAGE
  ) {
    return invalid(role, `${label} must be finite, bounded, and have positive extents.`);
  }

  return { x, y, w, h, page };
}

function parseConfidence(role: ReviewRole, value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return invalid(role, `${label} must be a finite confidence from 0 to 1.`);
  }

  return value;
}

function parsePoints(role: ReviewRole, value: unknown, label: string, minimumLength = 0): Point[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > MAX_PATH_POINTS) {
    return invalid(role, `${label} must be a bounded point array.`);
  }

  return value.map((item, index) => parsePoint(role, item, `${label}[${index}]`));
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function isLineKind(value: unknown): value is LineEvidence['lineKind'] {
  return typeof value === 'string' && LINE_KINDS.includes(value as LineEvidence['lineKind']);
}

function isLogicTopic(value: unknown): value is LogicEvidence['topic'] {
  return typeof value === 'string' && LOGIC_TOPICS.includes(value as LogicEvidence['topic']);
}

function parseSymbol(role: ReviewRole, value: unknown): SymbolEvidence {
  const item = asRecord(role, value, 'symbol');
  assertAllowedKeys(role, item, 'symbol', [
    'id',
    'typeCandidates',
    'rawLabel',
    'bounds',
    'ports',
    'confidence',
  ]);
  return {
    id: boundedString(role, item.id, 'symbol.id', MAX_ID_LENGTH),
    typeCandidates: boundedStringArray(role, item.typeCandidates, 'symbol.typeCandidates', 0),
    rawLabel: item.rawLabel === null
      ? null
      : boundedString(role, item.rawLabel, 'symbol.rawLabel'),
    bounds: parseBounds(role, item.bounds, 'symbol.bounds'),
    ports: parsePoints(role, item.ports, 'symbol.ports'),
    confidence: parseConfidence(role, item.confidence, 'symbol.confidence'),
  };
}

function parseLine(role: ReviewRole, value: unknown): LineEvidence {
  const item = asRecord(role, value, 'line');
  assertAllowedKeys(role, item, 'line', [
    'id',
    'lineKind',
    'path',
    'start',
    'end',
    'junctions',
    'crossovers',
    'confidence',
  ]);
  const lineKind = item.lineKind;
  if (!isLineKind(lineKind)) {
    return invalid(role, 'line.lineKind is not supported.');
  }
  const path = parsePoints(role, item.path, 'line.path', 2);
  const start = parsePoint(role, item.start, 'line.start');
  const end = parsePoint(role, item.end, 'line.end');
  if (!samePoint(start, path[0]) || !samePoint(end, path[path.length - 1])) {
    return invalid(role, 'line.start and line.end must match the polyline endpoints.');
  }
  return {
    id: boundedString(role, item.id, 'line.id', MAX_ID_LENGTH),
    lineKind,
    path,
    start,
    end,
    junctions: parsePoints(role, item.junctions, 'line.junctions'),
    crossovers: parsePoints(role, item.crossovers, 'line.crossovers'),
    confidence: parseConfidence(role, item.confidence, 'line.confidence'),
  };
}

function parseText(role: ReviewRole, value: unknown): TextEvidence {
  const item = asRecord(role, value, 'text');
  assertAllowedKeys(role, item, 'text', [
    'id',
    'raw',
    'candidates',
    'bounds',
    'confidence',
  ]);
  return {
    id: boundedString(role, item.id, 'text.id', MAX_ID_LENGTH),
    raw: boundedString(role, item.raw, 'text.raw'),
    candidates: boundedStringArray(role, item.candidates, 'text.candidates', 1),
    bounds: parseBounds(role, item.bounds, 'text.bounds'),
    confidence: parseConfidence(role, item.confidence, 'text.confidence'),
  };
}

function parseAttributes(role: ReviewRole, value: unknown): LogicEvidence['attributes'] {
  if (value === undefined) {
    return undefined;
  }

  const item = asRecord(role, value, 'logic.attributes');
  assertAllowedKeys(role, item, 'logic.attributes', [
    'fromId',
    'toId',
    'protectedById',
    'voltageV',
    'deviceType',
  ]);

  const attributes: NonNullable<LogicEvidence['attributes']> = {};
  if (item.fromId !== undefined) attributes.fromId = boundedString(role, item.fromId, 'logic.attributes.fromId', MAX_ID_LENGTH);
  if (item.toId !== undefined) attributes.toId = boundedString(role, item.toId, 'logic.attributes.toId', MAX_ID_LENGTH);
  if (item.protectedById !== undefined) {
    attributes.protectedById = item.protectedById === null
      ? null
      : boundedString(role, item.protectedById, 'logic.attributes.protectedById', MAX_ID_LENGTH);
  }
  if (item.voltageV !== undefined) {
    if (typeof item.voltageV !== 'number' || !Number.isFinite(item.voltageV) || item.voltageV <= 0) {
      return invalid(role, 'logic.attributes.voltageV must be a positive finite number.');
    }
    attributes.voltageV = item.voltageV;
  }
  if (item.deviceType !== undefined) attributes.deviceType = boundedString(role, item.deviceType, 'logic.attributes.deviceType');

  return attributes;
}

function parseLogic(role: ReviewRole, value: unknown): LogicEvidence {
  const item = asRecord(role, value, 'logic');
  assertAllowedKeys(role, item, 'logic', [
    'id',
    'topic',
    'subjectIds',
    'attributes',
    'statement',
    'evidenceBounds',
    'confidence',
  ]);
  const topic = item.topic;
  if (!isLogicTopic(topic)) {
    return invalid(role, 'logic.topic is not supported.');
  }
  if (!Array.isArray(item.evidenceBounds) || item.evidenceBounds.length === 0 || item.evidenceBounds.length > MAX_DETECTIONS) {
    return invalid(role, 'logic.evidenceBounds must be a non-empty bounded array.');
  }
  return {
    id: boundedString(role, item.id, 'logic.id', MAX_ID_LENGTH),
    topic,
    subjectIds: boundedStringArray(role, item.subjectIds, 'logic.subjectIds', 1),
    attributes: parseAttributes(role, item.attributes),
    statement: boundedString(role, item.statement, 'logic.statement'),
    evidenceBounds: item.evidenceBounds.map((bound, index) => parseBounds(role, bound, `logic.evidenceBounds[${index}]`)),
    confidence: parseConfidence(role, item.confidence, 'logic.confidence'),
  };
}

function parseCollection<T>(
  role: ReviewRole,
  raw: RawRecord,
  key: DetectionKey,
  parse: (value: unknown) => T,
): T[] | undefined {
  const value = raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length > MAX_DETECTIONS) {
    return invalid(role, `${key} must be a bounded array.`);
  }

  return value.map(parse);
}

function assertUniqueLocalIds(
  role: ReviewRole,
  collections: Array<ReadonlyArray<{ id: string }> | undefined>,
): void {
  const ids = new Set<string>();
  for (const collection of collections) {
    for (const item of collection ?? []) {
      if (ids.has(item.id)) {
        invalid(role, 'contains a duplicate local evidence id.');
      }
      ids.add(item.id);
    }
  }
}

export function parseRoleReviewData(role: ReviewRole, value: unknown): RoleReviewData {
  if (!REVIEW_ROLES.includes(role)) {
    return invalid(role, 'role is not supported.');
  }
  assertPayloadBudget(role, value);
  const raw = asRecord(role, value, 'review');
  const allowedCollections = ROLE_COLLECTIONS[role];
  const allowedKeys = new Set<string>(['warnings', 'confidence', ...allowedCollections]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    return invalid(role, 'contains a collection that is not allowed for this role.');
  }

  const warnings = raw.warnings === undefined
    ? []
    : boundedStringArray(role, raw.warnings, 'warnings', 0);
  const confidence = raw.confidence === undefined
    ? 0
    : parseConfidence(role, raw.confidence, 'confidence');
  const symbols = parseCollection(role, raw, 'symbols', (item) => parseSymbol(role, item));
  const lines = parseCollection(role, raw, 'lines', (item) => parseLine(role, item));
  const texts = parseCollection(role, raw, 'texts', (item) => parseText(role, item));
  const logic = parseCollection(role, raw, 'logic', (item) => parseLogic(role, item));
  assertUniqueLocalIds(role, [symbols, lines, texts, logic]);
  const result: RoleReviewData = { warnings, confidence };

  if (allowedCollections.includes('symbols')) result.symbols = symbols ?? [];
  if (allowedCollections.includes('lines')) result.lines = lines ?? [];
  if (allowedCollections.includes('texts')) result.texts = texts ?? [];
  if (allowedCollections.includes('logic')) result.logic = logic ?? [];

  return result;
}
