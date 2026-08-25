/**
 * 고객사 심볼 라이브러리의 브라우저·서버 공용 계약.
 *
 * 저장된 값은 사용자가 수정할 수 있으므로 사용할 때마다 이 파서로 검증한다.
 * Node 전용 모듈을 참조하지 않아 도면 화면에서도 같은 검증 규칙을 쓴다.
 */

import { SLD_COMPONENT_TYPES, type SLDComponentType } from '@/lib/sld-component-types';

export interface SymbolLibraryEntry {
  /** fingerprintBlock 산출값. fp2가 현행이며 fp1은 기존 파일 호환용이다. */
  fingerprint?: string;
  /** 블록명 별칭 — 지문이 없거나 이름만 아는 경우의 보조 키. */
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
const FINGERPRINT_RE = /^fp[12]:[0-9a-f]{16}$/;
const TYPE_SET = new Set<string>(SLD_COMPONENT_TYPES);
const hasOwn = (record: Record<string, unknown>, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(record, key)
);

/** 업로드·브라우저 저장값을 같은 규칙으로 검증하고 정규화한다. */
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
    let entryValid = true;
    let fingerprint: string | undefined;
    if (hasOwn(entry, 'fingerprint') && entry.fingerprint !== undefined) {
      if (typeof entry.fingerprint !== 'string' || !FINGERPRINT_RE.test(entry.fingerprint)) {
        errors.push(`${at}.fingerprint 형식 무효 (fp1 또는 fp2 + 16자리 hex)`);
        entryValid = false;
      } else {
        fingerprint = entry.fingerprint;
      }
    }

    const seenNames = new Set<string>();
    const blockNames: string[] = [];
    if (hasOwn(entry, 'blockNames') && entry.blockNames !== undefined) {
      if (!Array.isArray(entry.blockNames)) {
        errors.push(`${at}.blockNames 는 문자열 배열이어야 합니다`);
        entryValid = false;
      } else if (entry.blockNames.length > CAPS.blockNames) {
        errors.push(`${at}.blockNames 항목 수 ${entry.blockNames.length} > 한도 ${CAPS.blockNames}`);
        entryValid = false;
      } else {
        entry.blockNames.forEach((rawName, nameIndex) => {
          if (typeof rawName !== 'string') {
            errors.push(`${at}.blockNames[${nameIndex}] 는 문자열이어야 합니다`);
            entryValid = false;
            return;
          }
          const name = rawName.trim();
          if (!name || name.length > CAPS.nameLen) {
            errors.push(`${at}.blockNames[${nameIndex}] 길이는 1~${CAPS.nameLen}자여야 합니다`);
            entryValid = false;
            return;
          }
          const key = name.toLocaleLowerCase('ko-KR');
          if (!seenNames.has(key)) {
            seenNames.add(key);
            blockNames.push(name);
          }
        });
      }
    }

    let note: string | undefined;
    if (hasOwn(entry, 'note') && entry.note !== undefined) {
      if (typeof entry.note !== 'string' || entry.note.length > CAPS.noteLen) {
        errors.push(`${at}.note 는 ${CAPS.noteLen}자 이하 문자열이어야 합니다`);
        entryValid = false;
      } else {
        note = entry.note;
      }
    }

    let confirmedAt: string | undefined;
    if (hasOwn(entry, 'confirmedAt') && entry.confirmedAt !== undefined) {
      if (typeof entry.confirmedAt !== 'string') {
        errors.push(`${at}.confirmedAt 은 문자열이어야 합니다`);
        entryValid = false;
      } else {
        confirmedAt = entry.confirmedAt;
      }
    }

    if (!fingerprint && blockNames.length === 0) {
      errors.push(`${at} 는 fingerprint 또는 blockNames 중 하나는 가져야 합니다`);
      entryValid = false;
    }
    if (fingerprint?.startsWith('fp1:') && blockNames.length === 0) {
      errors.push(`${at} 의 구형 fp1 항목은 정확한 blockNames 별칭이 필요합니다. 결과 화면에서 다시 등록하세요`);
      entryValid = false;
    }
    if (!entryValid) return;
    entries.push({
      fingerprint,
      blockNames: blockNames.length > 0 ? blockNames : undefined,
      deviceType: deviceType as SLDComponentType,
      note,
      confirmedAt,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors, library: { schemaVersion: 1, organization, entries } };
}
