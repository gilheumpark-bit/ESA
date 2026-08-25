/**
 * multipart 폼의 `symbolLibrary` 파트 → 검증된 SymbolLibrary.
 *
 * /api/dxf(동기)와 /api/drawing-jobs(V3) 두 라우트가 같은 계약을 써야 하므로
 * 판독을 한 곳에 둔다. 무효 라이브러리는 조용히 무시하지 않는다 — 사용자는
 * 자기 라이브러리가 적용됐다고 믿고 결과를 읽을 것이므로, 무효면 이유를
 * 문장으로 돌려주고 요청을 세운다.
 */

import { parseSymbolLibrary, type SymbolLibrary } from '@/engine/topology/symbol-library';

const LIBRARY_MAX_BYTES = 1024 * 1024;

export type SymbolLibraryFormResult =
  | { ok: true; library?: SymbolLibrary }
  | { ok: false; message: string };

export async function readSymbolLibraryPart(
  part: FormDataEntryValue | null,
): Promise<SymbolLibraryFormResult> {
  if (part == null || part === '') return { ok: true };

  let rawText: string;
  if (typeof part === 'string') {
    if (new TextEncoder().encode(part).byteLength > LIBRARY_MAX_BYTES) {
      return { ok: false, message: '심볼 라이브러리가 너무 큽니다 (최대 1MB).' };
    }
    rawText = part;
  } else {
    if (part.size > LIBRARY_MAX_BYTES) {
      return { ok: false, message: '심볼 라이브러리 파일이 너무 큽니다 (최대 1MB).' };
    }
    rawText = await part.text();
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return { ok: false, message: '심볼 라이브러리가 JSON 형식이 아닙니다.' };
  }
  const lint = parseSymbolLibrary(parsedJson);
  if (!lint.ok || !lint.library) {
    return { ok: false, message: `심볼 라이브러리 검증 실패: ${lint.errors.join(' · ')}` };
  }
  return { ok: true, library: lint.library };
}

// IDENTITY_SEAL: lib/symbol-library-form | role=폼 파트→검증된 심볼 라이브러리(두 라우트 공용) | inputs=FormDataEntryValue | outputs=SymbolLibrary|오류 문장
