/**
 * multipart 파일 파트 안전 추출
 * ─────────────────────────────
 * `formData.get(name) as File`은 무검증 캐스팅이다 — 클라이언트가 같은 이름을
 * 문자열 필드로 보내면(curl로 흔함) 문자열엔 .size/.name이 없어서:
 *   - 크기 캡 비교가 `undefined > N`으로 항상 통과하고
 *   - .name.toLowerCase()·.arrayBuffer()에서 TypeError → 500 + 오해성 메시지
 * 가 났다(독립 심사 발각 — team-review rules 파트에서 실증, 동종 5곳).
 *
 * 여기서 타입을 판별해 "파일이어야 하는데 문자열이 왔다"를 400감으로 분리한다.
 */

export type FormFileResult =
  | { ok: true; file: File | null }
  | { ok: false; message: string };

export function getFormFile(formData: FormData, name: string): FormFileResult {
  const entry = formData.get(name);
  if (entry === null) return { ok: true, file: null };
  if (typeof entry === 'string') {
    return { ok: false, message: `${name}은(는) 문자열이 아니라 파일 파트로 첨부해야 합니다` };
  }
  return { ok: true, file: entry };
}

// IDENTITY_SEAL: lib/api/form-file | role=multipart 파일 파트 타입 안전 추출 | inputs=FormData+name | outputs=File|null|400감
