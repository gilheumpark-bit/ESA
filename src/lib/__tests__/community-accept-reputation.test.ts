import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 커뮤니티의 **읽기만 있고 쓰기가 없는 절반**을 선언한다.
 *
 * 실측 2026-07-28:
 *  ① `is_accepted` 는 답변 생성 시 `false` 로만 들어가고 이후 어디서도
 *     갱신되지 않는다 — src·supabase 전체에 UPDATE 0. 그런데 목록은
 *     `is_accepted DESC` 로 정렬하고 화면은 채택 답변에 초록 테두리와
 *     체크 배지를 그린다. **절대 뜨지 않는 표시다.**
 *  ② `getUserReputation`(질문 5 · 답변 10 · 채택 15) 은 호출처 0.
 *
 * ②가 ①보다 중요하다. 투표 RPC `cast_community_vote` 는 중복 방지 ·
 * 행 잠금 · 숨김 제외 · service_role 한정까지 갖췄는데 **자기 투표 금지가
 * 없다.** 지금은 평판을 아무도 안 읽어서 결과가 없지만, 평판을 화면에
 * 붙이는 순간 자기 글 자기 추천이 곧바로 점수가 된다.
 *
 * 그래서 이 검사는 "지금 이대로가 맞다" 를 잠그지 않는다. **쓰기 경로가
 * 생기는 순간 깨지도록** 잠근다 — 만드는 사람이 대장을 읽고 자기 투표·
 * 자기 채택 금지를 함께 넣게 하는 것이 목적이다.
 */
const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '__tests__'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|sql)$/.test(p)) out.push(p);
  }
  return out;
}

describe('커뮤니티 — 쓰기 없는 절반', () => {
  const sources = [...walk(join(REPO, 'src')), ...walk(join(REPO, 'supabase'))]
    .map((p) => ({ path: p, text: readFileSync(p, 'utf8') }));

  it('소스를 실제로 읽는다 — 0건이면 아래 검사가 공회전이다', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  /**
   * ① 채택은 **지어졌다**(2026-07-28, 마이그레이션 007). 이 검사는 그때
   * 깨졌고, 설계한 대로였다 — 쓰기 경로가 생기면 만드는 사람이 대장을
   * 읽고 자기 채택 금지를 함께 넣게 하는 것이 목적이었다. 실제로 그렇게
   * 했다(`community-accept-selfvote.test.ts`).
   *
   * 이제는 **거꾸로** 잠근다: 채택 경로가 사라지면 화면의 초록 테두리와
   * 체크 배지가 다시 절대 뜨지 않는 표시가 된다.
   */
  it('`is_accepted` 를 참으로 만드는 경로가 있다', () => {
    const writers = sources.filter(({ text }) =>
      /SET[\s\S]{0,80}is_accepted\s*=\s*(TRUE|true)/i.test(text));
    expect(writers.length).toBeGreaterThan(0);
  });

  /** ② 평판을 읽는 곳이 아직 없다. */
  it('`getUserReputation` 은 아직 호출처가 없다 — 배선하면 자기 투표가 점수가 된다', () => {
    // 주석에 이름이 나오는 것과 부르는 것은 다르다 — 마이그레이션 007 의
    // 설명문이 이 이름을 적었다가 오탐으로 걸렸다(2026-07-28). 실호출만 본다.
    const callers = sources.filter(({ path, text }) =>
      !path.endsWith('abuse-prevention.ts') && /getUserReputation\s*\(/.test(text));
    expect(callers.map((c) => c.path)).toEqual([]);
  });

  it('대장이 남은 휴면과 함께 해야 할 일을 적고 있다', () => {
    const manifest = read('docs/DORMANT_MANIFEST.md');
    expect(manifest).toContain('getUserReputation');
    // 채택·자기 투표 금지는 지어졌다. 대장은 그 사실과, 평판을 붙일 때
    // 문서/코드 산식을 맞추라는 것을 적고 있어야 한다.
    expect(manifest).toContain('자기 투표 금지는');
    expect(manifest).toContain('Downvote received');
  });
});

/**
 * 읽기 쪽은 지금도 정상이어야 한다 — 쓰기가 생겼을 때 바로 살아나도록.
 */
describe('커뮤니티 — 읽기 쪽 배선', () => {
  it('답변 목록이 채택을 먼저 보여준다', () => {
    expect(read('src/lib/community.ts')).toContain("order('is_accepted'");
  });

  it('행 매퍼가 채택 여부를 실어 준다', () => {
    expect(read('src/lib/community.ts')).toContain('isAccepted: row.is_accepted ?? false');
  });

  /**
   * 투표 RPC 가 갖춘 것들. 여기서 한 줄이라도 빠지면 조작이 열린다.
   */
  it.each([
    ['중복 투표 방지', 'previous_direction'],
    ['행 잠금', 'FOR UPDATE'],
    ['숨김 글 제외', 'hidden = false'],
    ['알 수 없는 사용자 거부', 'unknown user'],
    ['공개 실행 회수', 'REVOKE ALL ON FUNCTION cast_community_vote'],
  ])('투표 RPC 에 %s 가 있다', (_이름, needle) => {
    expect(read('supabase/migrations/001_initial_schema.sql')).toContain(needle);
  });
});
