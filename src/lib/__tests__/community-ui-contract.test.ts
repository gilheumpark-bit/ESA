import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 화면이 **읽는데 서버가 만들지 않는 필드**를 잡는다.
 *
 * 실측 2026-07-28: 커뮤니티 질문 목록이 `q.isExpertAuthor` 로 Expert 배지를
 * 그렸는데 `lib/community.ts` 의 `Question` 타입에도 행 매퍼에도 그런 필드가
 * 없었다 — 서버가 만들 방법이 없으니 **절대 뜨지 않는 배지**다.
 *
 * tsc 가 못 잡는 이유: 페이지가 응답 모양을 자기 파일 안에서 따로 선언하고
 * `fetch` 결과를 그 타입으로 단언한다. 두 선언이 어긋나도 컴파일은 통과한다.
 * 그래서 여기서 두 쪽을 직접 대조한다.
 */
const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

/** lib 이 내보내는 필드 이름 — 인터페이스 필드와 매퍼 키를 함께 긁는다. */
function producedFields(rel: string): Set<string> {
  const src = read(rel);
  return new Set([...src.matchAll(/^\s{2,}(\w+)\??:/gm)].map((m) => m[1]));
}

/** 페이지가 자기 파일에 선언한 인터페이스의 필드 중 실제로 읽는 것. */
function consumedFields(rel: string): { iface: string; field: string }[] {
  const src = read(rel);
  const out: { iface: string; field: string }[] = [];
  for (const iface of src.matchAll(/interface\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    for (const fld of iface[2].matchAll(/^\s+(\w+)\??:/gm)) {
      if (new RegExp(`\\.${fld[1]}\\b`).test(src)) out.push({ iface: iface[1], field: fld[1] });
    }
  }
  return out;
}

describe('커뮤니티 화면-서버 필드 계약', () => {
  const produced = producedFields('src/lib/community.ts');

  it('생산 필드를 실제로 읽는다 — 파싱이 죽으면 이 검사가 통째로 무의미하다', () => {
    expect(produced.size).toBeGreaterThan(30);
    expect(produced.has('isExpert')).toBe(true);
    expect(produced.has('answerCount')).toBe(true);
  });

  it.each([
    'src/app/(with-nav)/community/page.tsx',
    'src/app/(with-nav)/community/[id]/page.tsx',
  ])('%s 이 읽는 필드는 서버가 만든다', (page) => {
    const consumed = consumedFields(page);
    expect(consumed.length).toBeGreaterThan(5);
    const orphans = consumed.filter((c) => !produced.has(c.field)).map((c) => `${c.iface}.${c.field}`);
    expect(orphans).toEqual([]);
  });

  /**
   * Expert 배지는 답변에만 있다. 질문에도 달고 싶어지면 서버부터 만들어야
   * 한다 — 예전에 화면에만 달아 두고 몇 달을 안 뜬 채로 뒀다.
   */
  it('Expert 배지는 답변 전용이다', () => {
    expect(read('src/app/(with-nav)/community/page.tsx')).not.toContain('isExpertAuthor');
    expect(produced.has('isExpert')).toBe(true);
  });
});

/**
 * 배지를 참으로 만들 수 있는 유일한 경로는 `approveVerification` 인데
 * 부르는 곳이 없다 — 관리자 라우트는 읽기 전용 대시보드다. 즉 지금
 * `Answer.isExpert` 는 production 에서 항상 false 다.
 *
 * 이건 결함이 아니라 **아직 안 지은 기능**이고, 대장에 그렇게 적혀 있다.
 * 누가 승인 경로를 배선하면 이 검사가 깨진다 — 그때 대장을 갱신하고
 * 질문 쪽 배지도 함께 살리라는 뜻이다.
 */
describe('전문가 인증 승인 경로', () => {
  const SRC_DIRS = ['src/app', 'src/lib', 'src/components'];

  it('승인 함수는 아직 호출처가 없다 — 배선하면 대장을 갱신하라', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const hits = execSync(
      `git grep -l "approveVerification" -- ${SRC_DIRS.join(' ')} || true`,
      { cwd: REPO, encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.includes('expert-verification.ts') && !f.includes('__tests__'));

    expect(hits).toEqual([]);
  });

  it('대장이 이 휴면을 선언하고 있다', () => {
    const manifest = read('docs/DORMANT_MANIFEST.md');
    expect(manifest).toContain('expert-verification');
    expect(manifest).toContain('approveVerification');
  });
});
