/**
 * 선언이 아니라 바이트로 판정한다.
 *
 * `File.type` 은 클라이언트가 붙이는 문자열이다. 실측(2026-07-26): 텍스트
 * 5바이트에 `image/png` 를 달아 /api/ocr 에 넣으면 타입 검사를 통과했고,
 * 그 다음은 비전 LLM 호출이라 사용자 BYOK 요금을 쓰고 쓰레기를 받는다.
 */
import { sniffImageType, checkRasterImage } from '../image-signature';

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const webp = () => {
  const bytes = new Uint8Array(16);
  for (const [i, ch] of [...'RIFF'].entries()) bytes[i] = ch.charCodeAt(0);
  for (const [i, ch] of [...'WEBP'].entries()) bytes[8 + i] = ch.charCodeAt(0);
  return bytes;
};
const text = () => new Uint8Array([...'hello world'].map((c) => c.charCodeAt(0)));

describe('이미지 시그니처', () => {
  it('셋을 알아본다', () => {
    expect(sniffImageType(png())).toBe('image/png');
    expect(sniffImageType(jpeg())).toBe('image/jpeg');
    expect(sniffImageType(webp())).toBe('image/webp');
  });

  it('이미지가 아니면 알아보지 못한다', () => {
    expect(sniffImageType(text())).toBeUndefined();
    expect(sniffImageType(new Uint8Array())).toBeUndefined();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeUndefined(); // 잘린 PNG 머리
  });

  it('RIFF 이지만 WEBP 가 아닌 것(WAV)은 거른다', () => {
    const wav = new Uint8Array(16);
    for (const [i, ch] of [...'RIFF'].entries()) wav[i] = ch.charCodeAt(0);
    for (const [i, ch] of [...'WAVE'].entries()) wav[8 + i] = ch.charCodeAt(0);
    expect(sniffImageType(wav)).toBeUndefined();
  });

  it('이미지가 아닌 것은 사유와 함께 막는다', () => {
    const result = checkRasterImage(text());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('이미지 파일이 아닙니다');
  });

  it('확장자가 틀려도 바이트가 이미지면 통과시킨다', () => {
    // .jpg 로 저장된 PNG 는 현장에서 흔하다. 막을 이유가 없다.
    const result = checkRasterImage(png());
    expect(result).toEqual({ ok: true, type: 'image/png' });
  });
});
