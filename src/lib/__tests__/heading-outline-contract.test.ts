import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **제목 단계를 건너뛰지 않는다 (WCAG 1.3.1).**
 *
 * 라이브 실측(2026-07-29 · dev, 실제 이동 후 DOM):
 *
 *   /calc          h1 → h3 ×13   (h2 없음)
 *   /glossary      h1 → h3 ×13
 *   /settings/byok h1 → h3 ×8, 그 뒤에 h2 가 나옴(순서도 뒤집힘)
 *   /standards     h1 → h3
 *
 * 화면상으로는 멀쩡하다 — 크기는 Tailwind 클래스가 정하고 태그는 의미만 정하기
 * 때문이다. 그래서 눈으로는 절대 안 보이고, **제목으로 훑는 스크린리더 사용자
 * 에게만** 목차가 끊긴 채로 나간다.
 *
 * 이 검사는 렌더된 순서를 재지 않는다(jsdom 이 Next 페이지를 못 그린다).
 * 대신 **한 파일 안에서 h1 과 h3 가 같이 있으면서 h2 가 없는** 조합을 금지한다.
 * 그 조합이 위 네 건의 실제 형태였다. 조건부 렌더 때문에 오탐이 날 수 있으므로
 * 파일 단위로만 보고, 예외는 목록에 이유와 함께 적는다.
 */

const ROOTS = ['src/app', 'src/components'];

/**
 * 컴포넌트가 조각으로 쪼개져 파일 하나에 h2 가 없는 것이 정상인 곳.
 * 새로 추가할 땐 **왜 정상인지** 함께 적는다.
 */
const ALLOWED: Array<{ file: string; why: string }> = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root)));

describe('제목 목차 계약', () => {
  it('훑을 파일이 실제로 있다 — 공회전 반증', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('h1 이 있는 파일에서 h2 를 건너뛰고 h3 로 가지 않는다', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const rel = file.replace(process.cwd(), '').replace(/\\/g, '/');
      if (ALLOWED.some((a) => rel.endsWith(a.file))) continue;
      const hasH1 = /<h1[\s>]/.test(src);
      const hasH2 = /<h2[\s>]/.test(src);
      const hasH3 = /<h3[\s>]/.test(src);
      if (hasH1 && hasH3 && !hasH2) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  /** 금지 패턴이 실제로 무언가를 잡는지 — 조용히 0 건이면 영원히 초록이다. */
  it('탐지 규칙이 발화한다', () => {
    const bad = '<h1>제목</h1><h3>소제목</h3>';
    expect(/<h1[\s>]/.test(bad) && /<h3[\s>]/.test(bad) && !/<h2[\s>]/.test(bad)).toBe(true);
    const good = '<h1>제목</h1><h2>절</h2><h3>소제목</h3>';
    expect(/<h1[\s>]/.test(good) && /<h3[\s>]/.test(good) && !/<h2[\s>]/.test(good)).toBe(false);
  });
});
