import { readSymbolLibraryPart } from '@/lib/symbol-library-form';

describe('심볼 라이브러리 multipart 크기 계약', () => {
  it('문자 수가 아니라 UTF-8 바이트 기준으로 1MB 초과 문자열을 거부한다', async () => {
    const multibyteJson = JSON.stringify('가'.repeat(400_000));
    expect(multibyteJson.length).toBeLessThan(1024 * 1024);
    expect(new TextEncoder().encode(multibyteJson).byteLength).toBeGreaterThan(1024 * 1024);

    await expect(readSymbolLibraryPart(multibyteJson)).resolves.toEqual({
      ok: false,
      message: '심볼 라이브러리가 너무 큽니다 (최대 1MB).',
    });
  });
});
