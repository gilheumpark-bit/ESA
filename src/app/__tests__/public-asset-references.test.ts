import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** 문자열 값만 모은다 — 매니페스트는 얕은 JSON 이라 재귀 한 번이면 된다. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

const hasExtension = (ref: string) => path.extname(ref) !== '';

/**
 * 매니페스트와 서비스 워커가 가리키는 정적 파일이 실제로 있는지 본다.
 *
 * 매니페스트는 `/icons/*.png` 11곳을 가리켰지만 그 폴더는 저장소에 없었다 — 홈 화면
 * 설치 아이콘과 바로가기 아이콘이 전부 404 였다. 파일을 지우거나 옮길 때 여기서 깨진다.
 */
describe('public 정적 파일 참조', () => {
  test('manifest.json 이 가리키는 파일이 전부 존재한다', () => {
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'manifest.json'), 'utf8'));
    const refs = collectStrings(manifest).filter((ref) => ref.startsWith('/') && hasExtension(ref));

    expect(refs.length).toBeGreaterThan(0);
    const missing = refs.filter((ref) => !fs.existsSync(path.join(PUBLIC_DIR, ref)));
    expect(missing).toEqual([]);
  });

  test('sw.js 가 가리키는 이미지 파일이 전부 존재한다', () => {
    const source = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8');
    const refs = [...source.matchAll(/'(\/[^'\s]+\.(?:png|svg|ico|webp|jpg))'/g)].map((m) => m[1]);

    const missing = refs.filter((ref) => !fs.existsSync(path.join(PUBLIC_DIR, ref)));
    expect(missing).toEqual([]);
  });
});
