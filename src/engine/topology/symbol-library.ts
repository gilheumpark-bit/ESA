/**
 * 고객사 심볼 라이브러리 — 낯선 블록을 «그 회사의 심볼» 로 기억하는 장치.
 *
 * ## 왜 필요한가 (실사용 2026-08-24 요구)
 *
 * 설계사무소는 고객사마다 도면 작도 관례가 다르다. A사의 차단기 블록이
 * `CB-STD-01`, B사는 `BRK_TYPE2` — 전역 이름 휴리스틱(resolveBlockType)은
 * 이 임의 명명을 알 수 없고, 미식별 블록은 'load' 로 뭉개져 부하계산까지
 * 오염된다. 필요한 것은 설치할 수 있는 기성 라이브러리가 아니라(그런 것은
 * 존재하지 않는다) **회사별로 확정을 축적하는 등록 장치**다.
 *
 * ## 어떻게 «유사 패턴» 을 AI 없이 잡는가
 *
 * DXF 의 심볼은 블록 **정의**(기하 묶음)이고 INSERT 는 그 참조다. 같은
 * 회사 도면은 같은 블록 정의를 재사용하므로, 정의 기하의 정규화 지문이
 * 같으면 같은 심볼이다. 지문은 INSERT 의 위치·회전·배율과 무관하다 —
 * 참조가 아니라 정의에서 뽑기 때문이다. 이름을 바꿔 저장한 사본도
 * (기하가 같으면) 같은 지문으로 잡힌다. 이것이 벡터 경로의 «유사 패턴
 * 인식» 이며 결정론이다. 픽셀(이미지) 쪽 유사 인식은 VLM 몫으로 별개다.
 *
 * ## 축적 루프
 *
 * 미인식 블록은 결과에 `unknownSymbols`(이름·지문·개수)로 나온다. 사용자가
 * 종류를 확정해 라이브러리 JSON 에 넣으면, 그 회사의 다음 도면부터 지문
 * 매칭으로 자동 인식된다. 라이브러리는 이동 가능한 JSON 파일이다 — 계정도
 * 서버 저장도 요구하지 않아 사내망·DRM 환경(무키 vectorOnly)과 정합한다.
 */

import { createHash } from 'node:crypto';

import type { SLDComponentType } from '@/lib/sld-component-types';
import type { SymbolLibrary } from '@/lib/symbol-library-contract';

export { parseSymbolLibrary } from '@/lib/symbol-library-contract';
export type {
  SymbolLibrary,
  SymbolLibraryEntry,
  SymbolLibraryLint,
  UnknownSymbolReport,
} from '@/lib/symbol-library-contract';

// ─── 지문 ──────────────────────────────────────────────────────────────────

interface FingerprintEntity {
  type: string;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  position?: { x: number; y: number };
  vertices?: Array<{ x: number; y: number; bulge?: number; startWidth?: number; endWidth?: number }>;
  points?: Array<{ x: number; y: number }>;
  controlPoints?: Array<{ x: number; y: number }>;
  fitPoints?: Array<{ x: number; y: number }>;
  center?: { x: number; y: number };
  majorAxisEndPoint?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  axisRatio?: number;
  degreeOfSplineCurve?: number;
  shape?: boolean;
  name?: string;
  xScale?: number;
  yScale?: number;
}

interface GeometryPoint {
  x: number;
  y: number;
  z?: number;
  [key: string]: unknown;
}

const POSITION_FIELDS = [
  'startPoint',
  'endPoint',
  'center',
  'position',
  'anchorPoint',
  'middleOfText',
  'insertionPoint',
  'linearOrAngularPoint1',
  'linearOrAngularPoint2',
  'diameterOrRadiusPoint',
  'arcPoint',
] as const;
const POSITION_ARRAY_FIELDS = ['vertices', 'points', 'controlPoints', 'fitPoints'] as const;
const RELATIVE_VECTOR_FIELDS = ['majorAxisEndPoint', 'startTangent', 'endTangent'] as const;
const DIRECTION_VECTOR_FIELDS = ['normalVector', 'directionVector', 'extrusionDirection'] as const;
const LENGTH_FIELDS = [
  'radius',
  'thickness',
  'textHeight',
  'height',
  'width',
  'depth',
  'columnSpacing',
  'rowSpacing',
] as const;
const RAW_NUMBER_FIELDS = [
  'startAngle',
  'endAngle',
  'angleLength',
  'axisRatio',
  'rotation',
  'obliqueAngle',
  'scale',
  'xScale',
  'yScale',
  'zScale',
  'columnCount',
  'rowCount',
  'degreeOfSplineCurve',
  'dimensionType',
  'attachmentPoint',
  'drawingDirection',
  'halign',
  'valign',
  'horizontalJustification',
  'verticalJustification',
  'extrusionDirectionX',
  'extrusionDirectionY',
  'extrusionDirectionZ',
] as const;
const BOOLEAN_FIELDS = [
  'shape',
  'closed',
  'periodic',
  'rational',
  'planar',
  'linear',
  'hasContinuousLinetypePattern',
  'includesCurveFitVertices',
  'includesSplineFitVertices',
  'is3dPolyline',
  'is3dPolygonMesh',
  'is3dPolygonMeshClosed',
  'isPolyfaceMesh',
] as const;

function geometryPoint(value: unknown): GeometryPoint | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record.x === 'number'
    && Number.isFinite(record.x)
    && typeof record.y === 'number'
    && Number.isFinite(record.y)
    ? record as GeometryPoint
    : null;
}

function geometryPoints(value: unknown): GeometryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map(geometryPoint).filter((point): point is GeometryPoint => point !== null);
}

/**
 * 블록 정의 기하의 정규화 지문(v2).
 *
 * 잡는 것: 엔티티 종류와 내부 좌표·연결 형상·상대 반지름. 블록 전체를
 * 원점 이동·등비 정규화한 뒤 엔티티와 선 끝점 순서를 정규화하므로, 정의의
 * 기준점·크기·엔티티 저장 순서가 달라도 같은 형상은 같은 지문이다. INSERT의
 * 위치·회전·배율은 애초에 참조 정보라 이 정의 지문에 들어오지 않는다.
 *
 * 안 잡는 것: 절대 크기·레이어·색. 회사가 같은 심볼을 크기만 다르게 복제한
 * 정의는 정규화 형상이 같아 여전히 잡힌다. 기하가 실제로 다른 두 심볼
 * (예: NFB 와 MCCB 를 다르게 그리는 회사)은 다른 지문이 된다 — 그것이 맞다.
 * 텍스트 내용·레이어·색은 넣지 않는다. 정격 문구나 CAD 표시 속성이 바뀌어도
 * 심볼 정체성은 유지되어야 하기 때문이다.
 */
export function fingerprintBlock(entities: readonly FingerprintEntity[]): string | null {
  if (!entities || entities.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let pointCount = 0;
  let maxLinearSize = 0;
  const includePoint = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    pointCount += 1;
  };

  for (const entity of entities) {
    const record = entity as unknown as Record<string, unknown>;
    for (const field of POSITION_FIELDS) {
      const point = geometryPoint(record[field]);
      if (point) includePoint(point.x, point.y);
    }
    for (const field of POSITION_ARRAY_FIELDS) {
      for (const point of geometryPoints(record[field])) includePoint(point.x, point.y);
    }
    if (
      entity.center
      && Number.isFinite(entity.center.x)
      && Number.isFinite(entity.center.y)
      && typeof entity.radius === 'number'
      && Number.isFinite(entity.radius)
      && entity.radius > 0
    ) {
      includePoint(entity.center.x - entity.radius, entity.center.y - entity.radius);
      includePoint(entity.center.x + entity.radius, entity.center.y + entity.radius);
    }
    const center = geometryPoint(record.center);
    const majorAxis = geometryPoint(record.majorAxisEndPoint);
    if (center && majorAxis) {
      includePoint(center.x - Math.abs(majorAxis.x), center.y - Math.abs(majorAxis.y));
      includePoint(center.x + Math.abs(majorAxis.x), center.y + Math.abs(majorAxis.y));
    }
    for (const field of LENGTH_FIELDS) {
      const value = record[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        maxLinearSize = Math.max(maxLinearSize, Math.abs(value));
      }
    }
    for (const vertex of geometryPoints(record.vertices)) {
      for (const field of ['startWidth', 'endWidth'] as const) {
        const value = vertex[field];
        if (typeof value === 'number' && Number.isFinite(value)) {
          maxLinearSize = Math.max(maxLinearSize, Math.abs(value));
        }
      }
    }
  }
  if (pointCount === 0) return null;

  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.max(width, height, maxLinearSize);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const number = (value: number): string => {
    const rounded = (Math.round(value * 10_000) / 10_000).toFixed(4);
    return rounded === '-0.0000' ? '0.0000' : rounded;
  };
  const point = (value: unknown): string | null => {
    const parsed = geometryPoint(value);
    if (!parsed) return null;
    return `${number((parsed.x - minX) / scale)},${number((parsed.y - minY) / scale)}`;
  };
  const relativeVector = (value: unknown): string | null => {
    const parsed = geometryPoint(value);
    if (!parsed) return null;
    return `${number(parsed.x / scale)},${number(parsed.y / scale)}`;
  };
  const directionVector = (value: unknown): string | null => {
    const parsed = geometryPoint(value);
    if (!parsed) return null;
    const magnitude = Math.hypot(parsed.x, parsed.y, typeof parsed.z === 'number' ? parsed.z : 0);
    if (!Number.isFinite(magnitude) || magnitude === 0) return '0.0000,0.0000';
    return `${number(parsed.x / magnitude)},${number(parsed.y / magnitude)}`;
  };
  const vertex = (value: GeometryPoint): string => {
    const parts = [point(value)!];
    const bulge = value.bulge;
    if (typeof bulge === 'number' && Number.isFinite(bulge)) parts.push(`b=${number(bulge)}`);
    for (const field of ['startWidth', 'endWidth'] as const) {
      const widthValue = value[field];
      if (typeof widthValue === 'number' && Number.isFinite(widthValue)) {
        parts.push(`${field}=${number(widthValue / scale)}`);
      }
    }
    for (const field of ['faceA', 'faceB', 'faceC', 'faceD'] as const) {
      const face = value[field];
      if (typeof face === 'number' && Number.isFinite(face)) parts.push(`${field}=${number(face)}`);
    }
    return parts.join(',');
  };
  const path = (value: unknown, includeVertexGeometry = false): string | null => {
    const parsed = geometryPoints(value);
    if (parsed.length === 0) return null;
    const normalized = parsed.map((item) => includeVertexGeometry ? vertex(item) : point(item)!);
    if (normalized.length === 0) return null;
    const forward = normalized.join(';');
    const reverse = [...normalized].reverse().join(';');
    return forward <= reverse ? forward : reverse;
  };
  const normalizedKnots = (value: unknown): string | null => {
    if (!Array.isArray(value)) return null;
    const knots = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
    if (knots.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const knot of knots) {
      min = Math.min(min, knot);
      max = Math.max(max, knot);
    }
    const span = max - min;
    const normalized = knots.map((item) => number(span > 0 ? (item - min) / span : 0));
    const forward = normalized.join(',');
    const reverse = [...normalized].reverse().join(',');
    return forward <= reverse ? forward : reverse;
  };

  const signatures = entities.map((entity) => {
    const record = entity as unknown as Record<string, unknown>;
    const type = typeof entity.type === 'string' ? entity.type.trim().toUpperCase() || 'UNKNOWN' : 'UNKNOWN';
    const parts = [`t=${type}`];
    const endpoints = [point(record.startPoint), point(record.endPoint)]
      .filter((value): value is string => value !== null)
      .sort();
    if (endpoints.length > 0) parts.push(`e=${endpoints.join(';')}`);
    for (const field of POSITION_FIELDS) {
      if (field === 'startPoint' || field === 'endPoint') continue;
      const normalized = point(record[field]);
      if (normalized) parts.push(`${field}=${normalized}`);
    }
    for (const field of POSITION_ARRAY_FIELDS) {
      const normalized = path(record[field], field === 'vertices');
      if (normalized) parts.push(`${field}=${normalized}`);
    }
    for (const field of RELATIVE_VECTOR_FIELDS) {
      const normalized = relativeVector(record[field]);
      if (normalized) parts.push(`${field}=${normalized}`);
    }
    for (const field of DIRECTION_VECTOR_FIELDS) {
      const normalized = directionVector(record[field]);
      if (normalized) parts.push(`${field}=${normalized}`);
    }
    for (const field of LENGTH_FIELDS) {
      const value = record[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        parts.push(`${field}=${number(value / scale)}`);
      }
    }
    for (const field of RAW_NUMBER_FIELDS) {
      const value = record[field];
      if (typeof value === 'number' && Number.isFinite(value)) parts.push(`${field}=${number(value)}`);
    }
    for (const field of BOOLEAN_FIELDS) {
      if (typeof record[field] === 'boolean') parts.push(`${field}=${record[field] ? 1 : 0}`);
    }
    const knots = normalizedKnots(record.knotValues);
    if (knots) parts.push(`knotValues=${knots}`);
    if (type === 'INSERT' && typeof record.name === 'string') parts.push(`name=${record.name.trim().toLowerCase()}`);
    return parts.join('#');
  }).sort();

  const digest = createHash('sha256')
    .update(signatures.join('|'))
    .digest('hex')
    .slice(0, 16);
  return `fp2:${digest}`;
}

// ─── 매칭 ──────────────────────────────────────────────────────────────────

export interface SymbolLibraryIndex {
  organization: string;
  byFingerprint: Map<string, SLDComponentType>;
  /** 같은 지문에 서로 다른 기기 종류가 등록된 경우 — 지문만으로 자동 판정 금지. */
  ambiguousFingerprints: Set<string>;
  byBlockName: Map<string, SLDComponentType>;
  /** 같은 별칭에 서로 다른 기기 종류가 등록된 경우 — 이름만으로 자동 판정 금지. */
  ambiguousBlockNames: Set<string>;
  size: number;
}

/** 매 INSERT 마다 배열을 훑지 않도록 한 번 색인한다. 뒤 항목이 앞 항목을 덮지 않는다(선등록 우선). */
export function indexSymbolLibrary(library: SymbolLibrary): SymbolLibraryIndex {
  const byFingerprint = new Map<string, SLDComponentType>();
  const ambiguousFingerprints = new Set<string>();
  const byBlockName = new Map<string, SLDComponentType>();
  const ambiguousBlockNames = new Set<string>();
  for (const entry of library.entries) {
    if (entry.fingerprint && !ambiguousFingerprints.has(entry.fingerprint)) {
      const existingType = byFingerprint.get(entry.fingerprint);
      if (existingType && existingType !== entry.deviceType) {
        byFingerprint.delete(entry.fingerprint);
        ambiguousFingerprints.add(entry.fingerprint);
      } else if (!existingType) {
        byFingerprint.set(entry.fingerprint, entry.deviceType);
      }
    }
    for (const name of entry.blockNames ?? []) {
      const key = name.toLowerCase();
      if (ambiguousBlockNames.has(key)) continue;
      const existingType = byBlockName.get(key);
      if (existingType && existingType !== entry.deviceType) {
        byBlockName.delete(key);
        ambiguousBlockNames.add(key);
      } else if (!existingType) {
        byBlockName.set(key, entry.deviceType);
      }
    }
  }
  return {
    organization: library.organization,
    byFingerprint,
    ambiguousFingerprints,
    byBlockName,
    ambiguousBlockNames,
    size: library.entries.length,
  };
}

/**
 * 우선순위: 지문(기하 정체성) → 블록명(회사가 적어 준 별칭). 지문이 이기는
 * 이유 — 이름은 사본·정리 과정에서 바뀌지만 기하는 그 심볼의 정체다.
 */
export function matchSymbol(
  index: SymbolLibraryIndex,
  blockName: string,
  fingerprint: string | null,
): SLDComponentType | null {
  if (fingerprint && !index.ambiguousFingerprints.has(fingerprint)) {
    const byFp = index.byFingerprint.get(fingerprint);
    if (byFp) return byFp;
  }
  const nameKey = blockName.toLowerCase();
  if (index.ambiguousBlockNames.has(nameKey)) return null;
  return index.byBlockName.get(nameKey) ?? null;
}

// IDENTITY_SEAL: topology/symbol-library | role=고객사 심볼 등록·지문·매칭 정본 | inputs=library JSON·블록 정의 기하 | outputs=deviceType 매칭·unknownSymbols 재료
