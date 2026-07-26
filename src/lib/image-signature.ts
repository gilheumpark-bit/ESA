/**
 * 업로드된 바이트가 정말 그 형식인지 본다.
 *
 * `File.type` 은 클라이언트가 보내는 문자열이라 아무 파일에나 붙일 수 있다.
 * 실측(2026-07-26): 텍스트 5바이트에 `image/png` 를 달아 /api/ocr 에 넣으면
 * 타입 검사를 그대로 통과한다. 그 뒤는 비전 LLM 호출이라 **사용자 BYOK 요금**을
 * 쓰고 쓰레기 결과를 받는다.
 *
 * 그래서 선언이 아니라 바이트로 판정한다. 여기서 보는 것은 형식뿐이고,
 * 크기·개수 제한은 각 라우트가 따로 건다.
 */

export type RasterImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export const RASTER_IMAGE_TYPES: readonly RasterImageType[] = ['image/png', 'image/jpeg', 'image/webp'];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** JPEG 은 SOI(FFD8) 뒤 마커가 이어진다. FFD8FF 까지가 안전한 최소 판별이다. */
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return '';
  let out = '';
  for (let i = start; i < start + length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** 바이트로 판정한 형식. 셋 중 무엇도 아니면 undefined. */
export function sniffImageType(bytes: Uint8Array): RasterImageType | undefined {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  // WebP = RIFF 컨테이너. 4~7바이트는 파일 길이라 건너뛰고 8바이트째부터 본다.
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return undefined;
}

/**
 * 검증 결과. 실패 사유를 문자열로 돌려주고 던지지 않는다 — 라우트가 상태 코드를
 * 정하고, 사용자에게는 무엇이 잘못됐는지 그대로 보여줘야 한다.
 */
export type ImageCheck =
  | { ok: true; type: RasterImageType }
  | { ok: false; message: string };

/**
 * 선언된 형식과 실제 바이트가 맞는지 본다.
 *
 * 확장자·MIME 이 틀렸어도 바이트가 지원 형식이면 통과시킨다 — 현장에서 `.jpg`
 * 로 저장된 PNG 는 흔하고, 그걸 막는 것은 사용자에게 도움이 되지 않는다.
 * 막아야 할 것은 **이미지가 아닌 것**이다.
 */
export function checkRasterImage(bytes: Uint8Array): ImageCheck {
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return {
      ok: false,
      message: '이미지 파일이 아닙니다. JPEG·PNG·WebP 파일을 올려 주세요.',
    };
  }
  return { ok: true, type: sniffed };
}
