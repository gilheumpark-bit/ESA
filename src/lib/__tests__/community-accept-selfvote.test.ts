import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyVoteError } from '@/lib/community-error';

/**
 * 자기 글 자기 추천 · 자기 답변 자기 채택 금지.
 *
 * 커뮤니티는 읽기 쪽만 지어져 있었다(2026-07-28 실측). `is_accepted` 는
 * 답변 생성 시 false 로만 들어가고 이후 갱신이 없었는데도 목록은
 * `is_accepted DESC` 로 정렬하고 화면은 초록 테두리와 체크 배지를 그렸다 —
 * 절대 뜨지 않는 표시였다. 평판(`getUserReputation`)도 호출처가 0 이었다.
 *
 * 채택을 여는 김에 구멍을 함께 막는다. 평판은 질문 5 · 답변 10 · **채택
 * 15** 다. 채택이 가장 크고, 질문도 답변도 자기 것일 수 있어서 자기 채택이
 * 가장 넓은 통로다. 투표 RPC 에는 자기 투표 금지가 아예 없었다.
 *
 * 판정을 SQL 안에 두는 이유: 행 잠금과 같은 트랜잭션에서 봐야 경합에
 * 안전하고, 라우트에 한 벌 더 두면 두 벌이 갈린다(이 리포에서 이미 세 번
 * 겪은 계열이다).
 */
const REPO = join(__dirname, '..', '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/007_no_self_vote_and_accept_answer.sql'),
  'utf8',
);

const voteFn = /CREATE OR REPLACE FUNCTION cast_community_vote[\s\S]*?\n\$\$;/.exec(MIGRATION)?.[0] ?? '';
const acceptFn = /CREATE OR REPLACE FUNCTION accept_community_answer[\s\S]*?\n\$\$;/.exec(MIGRATION)?.[0] ?? '';

describe('자기 투표 금지', () => {
  it('마이그레이션을 실제로 읽는다 — 0자면 아래가 전부 공회전이다', () => {
    expect(voteFn.length).toBeGreaterThan(500);
    expect(acceptFn.length).toBeGreaterThan(500);
  });

  it('작성자를 읽어 와서 요청자와 비교한다', () => {
    expect(voteFn).toContain('author_id INTO current_votes, target_author');
    expect(voteFn).toContain('IF target_author = p_user_id THEN');
    expect(voteFn).toContain("RAISE EXCEPTION 'cannot vote on own post'");
  });

  it('기존 방어가 그대로 남아 있다 — 자기 투표를 막으며 다른 걸 잃지 않는다', () => {
    for (const needle of ['previous_direction', 'FOR UPDATE', 'hidden = false', 'unknown user',
      'REVOKE ALL ON FUNCTION cast_community_vote']) {
      expect(voteFn + MIGRATION).toContain(needle);
    }
  });
});

describe('답변 채택', () => {
  it('질문 작성자만 채택한다', () => {
    expect(acceptFn).toContain('IF v_question_author <> p_user_id THEN');
    expect(acceptFn).toContain("RAISE EXCEPTION 'only the question author can accept'");
  });

  it('자기 답변은 채택할 수 없다 — 평판에서 가장 큰 통로다', () => {
    expect(acceptFn).toContain('IF v_answer_author = p_user_id THEN');
    expect(acceptFn).toContain("RAISE EXCEPTION 'cannot accept own answer'");
  });

  it('질문당 하나 — 다시 채택하면 앞의 것이 풀린다', () => {
    expect(acceptFn).toMatch(/SET is_accepted = false[\s\S]*?WHERE question_id = v_question_id AND is_accepted = true/);
    expect(acceptFn).toMatch(/SET is_accepted = true[\s\S]*?WHERE id = p_answer_id/);
  });

  it('숨겨진 글은 채택 대상이 아니다 — 투표와 같은 규율', () => {
    expect((acceptFn.match(/hidden = false/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('경합에 안전하도록 행을 잠근다', () => {
    expect((acceptFn.match(/FOR UPDATE/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('공개 실행을 회수하고 service_role 만 준다', () => {
    expect(MIGRATION).toContain('REVOKE ALL ON FUNCTION accept_community_answer');
    expect(MIGRATION).toContain('GRANT EXECUTE ON FUNCTION accept_community_answer(UUID, TEXT) TO service_role');
  });

  it('채택하면 질문이 해결됨으로 바뀐다', () => {
    expect(acceptFn).toContain("SET status = 'resolved'");
  });
});

describe('오류가 사용자에게 읽히는 문구로 나간다', () => {
  it.each([
    ['cannot vote on own post', 403, '자기 글'],
    ['cannot accept own answer', 403, '자기 답변'],
    ['only the question author can accept', 403, '질문을 올린 분'],
    ['accept target not found', 404, '새로고침'],
  ])('%s → %i', (message, status, needle) => {
    const mapped = classifyVoteError(new Error(`[ESA-7007] Failed to accept answer: ${message}`));
    expect(mapped?.status).toBe(status);
    expect(mapped?.message).toContain(needle);
    // 내부 문구를 그대로 흘리지 않는다.
    expect(mapped?.message).not.toContain(message);
  });

  it('RPC 가 던지는 것이 하나도 빠짐없이 분류된다', () => {
    const thrown = [...new Set([...MIGRATION.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map((m) => m[1]))];
    expect(thrown.length).toBeGreaterThan(5);
    const unclassified = thrown.filter((m) => classifyVoteError(new Error(`x: ${m}`)) === null);
    expect(unclassified).toEqual([]);
  });
});

describe('배선', () => {
  const lib = readFileSync(join(REPO, 'src/lib/community.ts'), 'utf8');
  const route = readFileSync(join(REPO, 'src/app/api/community/[id]/route.ts'), 'utf8');

  it('lib 이 RPC 를 부른다 — 판정을 여기서 다시 하지 않는다', () => {
    expect(lib).toContain("admin.rpc('accept_community_answer'");
    expect(lib).not.toMatch(/acceptAnswer[\s\S]{0,600}author_id\s*===/);
  });

  it('라우트가 채택 액션을 연다', () => {
    expect(route).toContain("body?.action !== 'acceptAnswer'");
    expect(route).toContain('acceptAnswer(body.answerId, userId)');
    expect(route).toContain('export const PATCH');
  });

  it('라우트가 오류를 분류해 상태를 정한다 — 500 으로 뭉개지 않는다', () => {
    expect(route).toContain('classifyVoteError(err)');
    expect(route).toContain('mapped?.status ?? 500');
  });
});
