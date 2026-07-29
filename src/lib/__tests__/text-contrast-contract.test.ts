import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **읽히지 않는 회색을 막는다.**
 *
 * 2026-07-29 실측: BYOK 화면의 모델 목록 설명과 호환성 표가 "글자가 흐리다"는
 * 지적을 받았다. 재 보니 흰 배경의 `text-zinc-400` 은 대비 **2.56**, 어두운
 * 배경의 `dark:text-zinc-500` 은 **3.67** 로 12~14px 본문의 WCAG AA(4.5)에
 * 한참 못 미쳤다. 표 본문은 아예 글자색이 없어 상속으로 흐려져 있었다.
 *
 * Tailwind 유틸리티는 jsdom 이 계산해 주지 않으므로 비율을 여기서 다시 잴 수는
 * 없다. 대신 **팔레트 값으로 미리 계산해 낙제한 조합만 금지**한다:
 *
 *   라이트(#fff)   zinc-400 2.56 ✗ · zinc-500 4.83 ✓ · zinc-600 7.73 ✓
 *   다크(#18181b)  zinc-500 3.67 ✗ · zinc-400 6.91 ✓ · zinc-300 11.99 ✓
 *
 * placeholder 는 제외한다 — 입력 힌트가 본문보다 옅은 것은 의도된 관례이고,
 * 값을 입력하면 사라진다.
 */

const ROOTS = ['src/app', 'src/components'];

/** 낙제 조합. 값은 위 표에서 왔고, 새로 추가할 땐 비율을 함께 적을 것. */
const BANNED: Array<{ pattern: RegExp; label: string; ratio: string }> = [
  { pattern: /(?<!dark:)(?<!placeholder-)\btext-zinc-400\b/, label: 'text-zinc-400 (라이트)', ratio: '2.56' },
  { pattern: /(?<!placeholder-)\bdark:text-zinc-500\b/, label: 'dark:text-zinc-500 (다크)', ratio: '3.67' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root)));

describe('본문 대비 계약', () => {
  it('훑을 파일이 실제로 있다 — 공회전 반증', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(BANNED)('$label 은 쓰지 않는다 (대비 $ratio)', ({ pattern }) => {
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      src.split(/\r?\n/).forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${file.replace(process.cwd(), '')}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  /**
   * 금지 목록이 실제로 무언가를 걸러 내는지 — 정규식이 조용히 아무것도 안
   * 잡으면 이 검사는 영원히 초록이다(§2.2).
   */
  it('금지 정규식이 실제로 발화한다', () => {
    const sample = '<p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">x</p>';
    for (const { pattern } of BANNED) expect(pattern.test(sample)).toBe(true);
    // 통과해야 할 조합은 잡지 않는다 — 과차단이면 리팩터가 막힌다.
    const ok = '<p className="text-zinc-500 dark:text-zinc-400">x</p>';
    for (const { pattern } of BANNED) expect(pattern.test(ok)).toBe(false);
    const placeholder = '<input className="placeholder-zinc-400 dark:placeholder-zinc-500" />';
    for (const { pattern } of BANNED) expect(pattern.test(placeholder)).toBe(false);
  });
});
