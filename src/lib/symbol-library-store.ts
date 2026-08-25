'use client';

/**
 * 고객사 심볼 라이브러리의 브라우저 저장 정본.
 *
 * 심볼 매핑은 도면 원본이나 API 키가 아닌 사용자 사전이므로 localStorage에
 * 보존한다. 저장값은 매번 공용 계약으로 다시 검증하며, 손상값은 자동 전송하지
 * 않는다. 사용자는 JSON으로 반출해 다른 PC·사내 저장소로 옮길 수 있다.
 */

import {
  parseSymbolLibrary,
  type SymbolLibrary,
  type SymbolLibraryEntry,
} from '@/lib/symbol-library-contract';
import { SLD_COMPONENT_TYPES, type SLDComponentType } from '@/lib/sld-component-types';

export const SYMBOL_LIBRARY_CATALOG_KEY = 'esva-symbol-libraries-v1';

const CATALOG_SCHEMA_VERSION = 1 as const;
const MAX_LIBRARIES = 20;
const MAX_LIBRARY_BYTES = 1024 * 1024;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const DEVICE_TYPE_SET = new Set<string>(SLD_COMPONENT_TYPES);

export interface SymbolLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SymbolLibraryCatalog {
  schemaVersion: 1;
  activeOrganization: string | null;
  libraries: SymbolLibrary[];
}

export interface SymbolLibraryCatalogRead {
  catalog: SymbolLibraryCatalog;
  warning?: string;
}

export interface SymbolMappingInput {
  blockName: string;
  fingerprint: string | null;
  deviceType: SLDComponentType;
  note?: string;
}

function emptyCatalog(): SymbolLibraryCatalog {
  return { schemaVersion: CATALOG_SCHEMA_VERSION, activeOrganization: null, libraries: [] };
}

function defaultStorage(): SymbolLibraryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function organizationKey(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR');
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function writeCatalog(
  catalog: SymbolLibraryCatalog,
  storage: SymbolLibraryStorage | null,
): SymbolLibraryCatalogRead {
  if (!storage) throw new Error('이 브라우저에서는 회사 심볼 저장소를 사용할 수 없습니다.');
  const serialized = JSON.stringify(catalog);
  if (utf8Bytes(serialized) > MAX_CATALOG_BYTES) {
    throw new Error('회사 심볼 라이브러리 저장 한도(전체 4MB)를 초과했습니다.');
  }
  try {
    storage.setItem(SYMBOL_LIBRARY_CATALOG_KEY, serialized);
  } catch {
    throw new Error('회사 심볼 라이브러리를 브라우저에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인하세요.');
  }
  return { catalog };
}

/** 저장값 전체가 유효할 때만 반환한다. 일부 손상값을 섞어 자동 적용하지 않는다. */
export function readSymbolLibraryCatalog(
  storage: SymbolLibraryStorage | null = defaultStorage(),
): SymbolLibraryCatalogRead {
  if (!storage) return { catalog: emptyCatalog() };
  try {
    const raw = storage.getItem(SYMBOL_LIBRARY_CATALOG_KEY);
    if (!raw) return { catalog: emptyCatalog() };
    if (utf8Bytes(raw) > MAX_CATALOG_BYTES) throw new Error('catalog bytes');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.schemaVersion !== CATALOG_SCHEMA_VERSION || !Array.isArray(parsed.libraries)) {
      throw new Error('catalog schema');
    }
    if (parsed.libraries.length > MAX_LIBRARIES) throw new Error('catalog size');

    const libraries: SymbolLibrary[] = [];
    const organizations = new Set<string>();
    for (const candidate of parsed.libraries) {
      if (utf8Bytes(JSON.stringify(candidate)) > MAX_LIBRARY_BYTES) throw new Error('library bytes');
      const lint = parseSymbolLibrary(candidate);
      if (!lint.ok || !lint.library) throw new Error(lint.errors.join(' · '));
      const key = organizationKey(lint.library.organization);
      if (organizations.has(key)) throw new Error('duplicate organization');
      organizations.add(key);
      libraries.push(lint.library);
    }

    const activeRaw = parsed.activeOrganization;
    if (activeRaw !== null && typeof activeRaw !== 'string') throw new Error('active organization');
    let activeOrganization: string | null = null;
    if (typeof activeRaw === 'string') {
      const active = libraries.find((library) => organizationKey(library.organization) === organizationKey(activeRaw));
      if (!active) throw new Error('missing active organization');
      activeOrganization = active.organization;
    }

    return {
      catalog: { schemaVersion: CATALOG_SCHEMA_VERSION, activeOrganization, libraries },
    };
  } catch {
    return {
      catalog: emptyCatalog(),
      warning: '저장된 회사 심볼 라이브러리가 손상되거나 변조되어 자동 적용하지 않았습니다. 정상 JSON을 다시 가져오세요.',
    };
  }
}

export function getActiveSymbolLibrary(catalog: SymbolLibraryCatalog): SymbolLibrary | null {
  if (!catalog.activeOrganization) return null;
  const key = organizationKey(catalog.activeOrganization);
  return catalog.libraries.find((library) => organizationKey(library.organization) === key) ?? null;
}

/** 가져오기 또는 화면 등록 결과를 저장하고 그 회사를 활성화한다. */
export function saveSymbolLibrary(
  library: SymbolLibrary,
  storage: SymbolLibraryStorage | null = defaultStorage(),
): SymbolLibraryCatalogRead {
  const lint = parseSymbolLibrary(library);
  if (!lint.ok || !lint.library) {
    throw new Error(`심볼 라이브러리 검증 실패: ${lint.errors.join(' · ')}`);
  }
  const encoded = JSON.stringify(lint.library);
  if (utf8Bytes(encoded) > MAX_LIBRARY_BYTES) {
    throw new Error('회사 심볼 라이브러리가 너무 큽니다 (회사당 최대 1MB).');
  }

  const current = readSymbolLibraryCatalog(storage).catalog;
  const key = organizationKey(lint.library.organization);
  const existingIndex = current.libraries.findIndex((candidate) => organizationKey(candidate.organization) === key);
  const libraries = [...current.libraries];
  if (existingIndex >= 0) libraries[existingIndex] = lint.library;
  else libraries.push(lint.library);
  if (libraries.length > MAX_LIBRARIES) {
    throw new Error(`회사 심볼 라이브러리는 최대 ${MAX_LIBRARIES}개까지 저장할 수 있습니다.`);
  }

  return writeCatalog({
    schemaVersion: CATALOG_SCHEMA_VERSION,
    activeOrganization: lint.library.organization,
    libraries,
  }, storage);
}

export function importSymbolLibraryText(
  text: string,
  storage: SymbolLibraryStorage | null = defaultStorage(),
): SymbolLibraryCatalogRead {
  if (utf8Bytes(text) > MAX_LIBRARY_BYTES) {
    throw new Error('회사 심볼 라이브러리 파일이 너무 큽니다 (최대 1MB).');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('회사 심볼 라이브러리가 JSON 형식이 아닙니다.');
  }
  const lint = parseSymbolLibrary(parsed);
  if (!lint.ok || !lint.library) {
    throw new Error(`심볼 라이브러리 검증 실패: ${lint.errors.join(' · ')}`);
  }
  return saveSymbolLibrary(lint.library, storage);
}

export function selectSymbolLibrary(
  organization: string | null,
  storage: SymbolLibraryStorage | null = defaultStorage(),
): SymbolLibraryCatalogRead {
  const current = readSymbolLibraryCatalog(storage);
  if (current.warning) throw new Error(current.warning);
  if (organization === null) {
    return writeCatalog({ ...current.catalog, activeOrganization: null }, storage);
  }
  const selected = current.catalog.libraries.find(
    (library) => organizationKey(library.organization) === organizationKey(organization),
  );
  if (!selected) throw new Error('선택한 회사 심볼 라이브러리를 찾을 수 없습니다.');
  return writeCatalog({ ...current.catalog, activeOrganization: selected.organization }, storage);
}

export function deleteSymbolLibrary(
  organization: string,
  storage: SymbolLibraryStorage | null = defaultStorage(),
): SymbolLibraryCatalogRead {
  const current = readSymbolLibraryCatalog(storage);
  if (current.warning) throw new Error(current.warning);
  const key = organizationKey(organization);
  const libraries = current.catalog.libraries.filter((library) => organizationKey(library.organization) !== key);
  if (libraries.length === current.catalog.libraries.length) {
    throw new Error('삭제할 회사 심볼 라이브러리를 찾을 수 없습니다.');
  }
  const activeOrganization = current.catalog.activeOrganization
    && organizationKey(current.catalog.activeOrganization) !== key
    ? current.catalog.activeOrganization
    : null;
  return writeCatalog({ schemaVersion: CATALOG_SCHEMA_VERSION, activeOrganization, libraries }, storage);
}

function mergeNames(existing: string[] | undefined, blockName: string): string[] | undefined {
  const name = blockName.trim();
  if (!name) return existing;
  const names = [...(existing ?? [])];
  if (!names.some((candidate) => candidate.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'))) {
    names.push(name);
  }
  return names;
}

/** 미인식 심볼을 사용자가 확정한 결과를 회사별 라이브러리에 누적한다. */
export function upsertSymbolMappings(
  organization: string,
  mappings: SymbolMappingInput[],
  storage: SymbolLibraryStorage | null = defaultStorage(),
  confirmedAt: string = new Date().toISOString(),
): SymbolLibraryCatalogRead {
  const company = organization.trim();
  if (!company) throw new Error('회사명을 입력하세요.');
  if (mappings.length === 0) throw new Error('저장할 심볼을 하나 이상 선택하세요.');

  const current = readSymbolLibraryCatalog(storage).catalog;
  const existing = current.libraries.find(
    (library) => organizationKey(library.organization) === organizationKey(company),
  );
  const entries: SymbolLibraryEntry[] = (existing?.entries ?? []).map((entry) => ({
    ...entry,
    blockNames: entry.blockNames ? [...entry.blockNames] : undefined,
  }));

  for (const mapping of mappings) {
    if (!DEVICE_TYPE_SET.has(mapping.deviceType)) throw new Error('지원하지 않는 기기 종류입니다.');
    const blockName = mapping.blockName.trim();
    const fingerprint = mapping.fingerprint ?? undefined;
    if (!fingerprint && !blockName) throw new Error('심볼 지문 또는 블록명이 필요합니다.');

    const sameFingerprintAndName = fingerprint && blockName
      ? entries.findIndex((entry) => (
          entry.fingerprint === fingerprint
          && entry.blockNames?.some((name) => name.toLocaleLowerCase('ko-KR') === blockName.toLocaleLowerCase('ko-KR'))
        ))
      : -1;
    const sameFingerprintAndType = fingerprint && sameFingerprintAndName < 0
      ? entries.findIndex((entry) => entry.fingerprint === fingerprint && entry.deviceType === mapping.deviceType)
      : -1;
    const sameNameWithoutFingerprint = sameFingerprintAndName < 0 && sameFingerprintAndType < 0 && !fingerprint
      ? entries.findIndex((entry) => (
          !entry.fingerprint
          && entry.blockNames?.some((name) => name.toLocaleLowerCase('ko-KR') === blockName.toLocaleLowerCase('ko-KR'))
        ))
      : -1;
    const targetIndex = sameFingerprintAndName >= 0
      ? sameFingerprintAndName
      : sameFingerprintAndType >= 0
        ? sameFingerprintAndType
        : sameNameWithoutFingerprint;

    if (targetIndex >= 0) {
      const target = entries[targetIndex];
      entries[targetIndex] = {
        ...target,
        fingerprint: fingerprint ?? target.fingerprint,
        blockNames: mergeNames(target.blockNames, blockName),
        deviceType: mapping.deviceType,
        note: mapping.note?.trim() || target.note,
        confirmedAt,
      };
    } else {
      entries.push({
        fingerprint,
        blockNames: blockName ? [blockName] : undefined,
        deviceType: mapping.deviceType,
        note: mapping.note?.trim() || undefined,
        confirmedAt,
      });
    }
  }

  return saveSymbolLibrary({
    schemaVersion: 1,
    organization: existing?.organization ?? company,
    entries,
  }, storage);
}
