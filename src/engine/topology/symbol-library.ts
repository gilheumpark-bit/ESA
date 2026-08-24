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

import { SLD_COMPONENT_TYPES, type SLDComponentType } from '@/lib/sld-recognition';

// ─── 스키마 ────────────────────────────────────────────────────────────────

export interface SymbolLibraryEntry {
  /** fingerprintBlock 산출값. 'fp1:' 접두 + 16 hex. */
  fingerprint?: string;
  /** 블록명 별칭 — 지문이 없거나(수기 작성) 이름만 아는 경우의 보조 키. */
  blockNames?: string[];
  deviceType: SLDComponentType;
  note?: string;
  confirmedAt?: string;
}

export interface SymbolLibrary {
  schemaVersion: 1;
  /** 고객사 식별 — 표시·정리용이며 매칭에는 쓰지 않는다. */
  organization: string;
  entries: SymbolLibraryEntry[];
}

export interface SymbolLibraryLint {
  ok: boolean;
  library?: SymbolLibrary;
  errors: string[];
}

/** 파서 결과에 싣는 미인식 심볼 1종 — 사용자가 라이브러리에 추가할 재료. */
export interface UnknownSymbolReport {
  blockName: string;
  fingerprint: string | null;
  count: number;
  samplePosition: { x: number; y: number };
}

const CAPS = { entries: 500, blockNames: 20, nameLen: 120, noteLen: 300, orgLen: 120 } as const;
const FINGERPRINT_RE = /^fp1:[0-9a-f]{16}$/;
const TYPE_SET = new Set<string>(SLD_COMPONENT_TYPES);

// ─── 린트 ──────────────────────────────────────────────────────────────────

/**
 * 업로드된 JSON 을 검증한다. 룰팩(parseCustomRuleSet)과 같은 태도 —
 * 무엇이 왜 무효인지 문장으로 돌려주고, 무효면 아무것도 적용하지 않는다.
 */
export function parseSymbolLibrary(raw: unknown): SymbolLibraryLint {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['라이브러리 루트는 JSON 객체여야 합니다'] };
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) errors.push('schemaVersion 은 1 이어야 합니다');
  const organization = typeof record.organization === 'string' ? record.organization.trim() : '';
  if (!organization || organization.length > CAPS.orgLen) {
    errors.push(`organization 누락 또는 무효 (1~${CAPS.orgLen}자)`);
  }
  if (!Array.isArray(record.entries) || record.entries.length === 0) {
    errors.push('entries 는 비어 있지 않은 배열이어야 합니다');
    return { ok: false, errors };
  }
  if (record.entries.length > CAPS.entries) {
    errors.push(`항목 수 ${record.entries.length} > 한도 ${CAPS.entries}`);
    return { ok: false, errors };
  }

  const entries: SymbolLibraryEntry[] = [];
  record.entries.forEach((item, index) => {
    const at = `entries[${index}]`;
    if (typeof item !== 'object' || item === null) {
      errors.push(`${at} 는 객체여야 합니다`);
      return;
    }
    const entry = item as Record<string, unknown>;
    const deviceType = typeof entry.deviceType === 'string' ? entry.deviceType : '';
    if (!TYPE_SET.has(deviceType)) {
      errors.push(`${at}.deviceType «${deviceType}» 는 표준 기기 종류가 아닙니다`);
      return;
    }
    const fingerprint = typeof entry.fingerprint === 'string' ? entry.fingerprint : undefined;
    if (fingerprint !== undefined && !FINGERPRINT_RE.test(fingerprint)) {
      errors.push(`${at}.fingerprint 형식 무효 (fp1: + 16자리 hex)`);
      return;
    }
    const namesRaw = Array.isArray(entry.blockNames) ? entry.blockNames : [];
    const blockNames = namesRaw
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && name.length <= CAPS.nameLen)
      .slice(0, CAPS.blockNames);
    if (!fingerprint && blockNames.length === 0) {
      errors.push(`${at} 는 fingerprint 또는 blockNames 중 하나는 가져야 합니다`);
      return;
    }
    entries.push({
      fingerprint,
      blockNames: blockNames.length > 0 ? blockNames : undefined,
      deviceType: deviceType as SLDComponentType,
      note: typeof entry.note === 'string' ? entry.note.slice(0, CAPS.noteLen) : undefined,
      confirmedAt: typeof entry.confirmedAt === 'string' ? entry.confirmedAt : undefined,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors, library: { schemaVersion: 1, organization, entries } };
}

// ─── 지문 ──────────────────────────────────────────────────────────────────

interface FingerprintEntity {
  type: string;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  vertices?: Array<{ x: number; y: number }>;
  center?: { x: number; y: number };
  radius?: number;
}

/**
 * 블록 정의 기하의 정규화 지문.
 *
 * 잡는 것: 엔티티 종류별 개수 + 정의 자체 좌표계의 가로세로 비율(2자리) +
 * 원·호 반지름의 상대 크기 분포. 전부 블록 **정의** 좌표라 INSERT 의
 * 위치·회전·배율에 불변이고, 같은 정의는 항상 같은 지문이다.
 *
 * 안 잡는 것: 절대 크기·레이어·색. 회사가 같은 심볼을 크기만 다르게 복제한
 * 정의는 비율·상대반지름이 같아 여전히 잡힌다. 기하가 실제로 다른 두 심볼
 * (예: NFB 와 MCCB 를 다르게 그리는 회사)은 다른 지문이 된다 — 그것이 맞다.
 * 텍스트 내용은 지문에 넣지 않는다 — 정격 문구가 바뀌어도 심볼 정체성은
 * 유지되어야 하므로 TEXT 는 개수만 센다.
 */
export function fingerprintBlock(entities: readonly FingerprintEntity[]): string | null {
  if (!entities || entities.length === 0) return null;

  const counts = new Map<string, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const radii: number[] = [];

  for (const entity of entities) {
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    for (const point of [entity.startPoint, entity.endPoint, entity.center, ...(entity.vertices ?? [])]) {
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        xs.push(point.x);
        ys.push(point.y);
      }
    }
    if (typeof entity.radius === 'number' && Number.isFinite(entity.radius) && entity.radius > 0) {
      radii.push(entity.radius);
    }
  }
  if (xs.length === 0) return null;

  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const larger = Math.max(width, height);
  const aspect = larger > 0 ? (Math.min(width, height) / larger).toFixed(2) : '0.00';
  const relRadii = larger > 0
    ? radii.map((r) => (r / larger).toFixed(2)).sort().join(',')
    : radii.length > 0 ? 'r-only' : '';

  const countPart = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${type}=${n}`)
    .join('|');

  const digest = createHash('sha256')
    .update(`${countPart}#a=${aspect}#r=${relRadii}`)
    .digest('hex')
    .slice(0, 16);
  return `fp1:${digest}`;
}

// ─── 매칭 ──────────────────────────────────────────────────────────────────

export interface SymbolLibraryIndex {
  organization: string;
  byFingerprint: Map<string, SLDComponentType>;
  byBlockName: Map<string, SLDComponentType>;
  size: number;
}

/** 매 INSERT 마다 배열을 훑지 않도록 한 번 색인한다. 뒤 항목이 앞 항목을 덮지 않는다(선등록 우선). */
export function indexSymbolLibrary(library: SymbolLibrary): SymbolLibraryIndex {
  const byFingerprint = new Map<string, SLDComponentType>();
  const byBlockName = new Map<string, SLDComponentType>();
  for (const entry of library.entries) {
    if (entry.fingerprint && !byFingerprint.has(entry.fingerprint)) {
      byFingerprint.set(entry.fingerprint, entry.deviceType);
    }
    for (const name of entry.blockNames ?? []) {
      const key = name.toLowerCase();
      if (!byBlockName.has(key)) byBlockName.set(key, entry.deviceType);
    }
  }
  return { organization: library.organization, byFingerprint, byBlockName, size: library.entries.length };
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
  if (fingerprint) {
    const byFp = index.byFingerprint.get(fingerprint);
    if (byFp) return byFp;
  }
  return index.byBlockName.get(blockName.toLowerCase()) ?? null;
}

// IDENTITY_SEAL: topology/symbol-library | role=고객사 심볼 등록·지문·매칭 정본 | inputs=library JSON·블록 정의 기하 | outputs=deviceType 매칭·unknownSymbols 재료
