import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { classifyVoteError, VOTE_ERROR_MATCHES } from '@/lib/community-error';

/**
 * 투표 실패가 500 으로 나가지 않는지 본다.
 *
 * `cast_community_vote` 는 호출자 잘못을 `RAISE EXCEPTION` 으로 던지고
 * `lib/community.ts` 가 `[ESA-7006] Failed to vote: …` 로 감싼다. 라우트는
 * 그 전부를 **500** 으로 냈다(실측 2026-07-28).
 *
 * 가장 흔한 경우가 문제다: 신고 3 회면 글이 자동으로 숨겨지고
 * (`AUTO_HIDE_THRESHOLD`) RPC 는 숨겨진 글을 투표 대상에서 뺀다
 * (`hidden = false`). 화면을 열어 둔 사이에 숨겨지면 **정상적인 경합**인데
 * 500 이 나가 운영 알람이 울리고, 사용자는 "투표를 반영하지 못했습니다" 만
 * 보고 왜인지 모른다.
 *
 * 정본은 마이그레이션 SQL 이다 — 아래 첫 검사가 그 파일의 `RAISE EXCEPTION`
 * 을 전부 긁어 분류되는지 대조한다. RPC 에 새 예외를 넣으면 여기서 걸린다.
 */
const REPO = join(__dirname, '..', '..', '..');
// RPC 는 뒤 마이그레이션에서 교체된다(007 이 자기 투표 금지를 넣었다).
// 001 만 보면 새 예외를 놓친다 — 전부 이어 붙여 본다.
const MIGRATION = readdirSync(join(REPO, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(REPO, 'supabase/migrations', name), 'utf8'))
  .join('\n');

/**
 * `cast_community_vote` 본문의 `RAISE EXCEPTION` 문구를 뽑는다.
 *
 * 함수는 뒤 마이그레이션이 `CREATE OR REPLACE` 로 갈아엎는다. 첫 정의만
 * 보면 나중에 추가된 예외(007 의 자기 투표 금지)를 놓치므로 **모든 정의**를
 * 모은다 — 어느 판이 실제로 배포됐든 분류는 다 있어야 한다.
 */
function voteExceptions(): string[] {
  const bodies = [...MIGRATION.matchAll(/CREATE OR REPLACE FUNCTION cast_community_vote[\s\S]*?\n\$\$;/g)]
    .map((m) => m[0]);
  return [...new Set(bodies.flatMap((body) =>
    [...body.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map((m) => m[1])))];
}

describe('투표 오류 → HTTP 상태', () => {
  const thrown = voteExceptions();

  it('RPC 본문을 실제로 긁어낸다 — 0건이면 아래 대조가 공회전이다', () => {
    expect(thrown.length).toBeGreaterThan(2);
  });

  it('RPC 가 던지는 것은 하나도 빠짐없이 분류된다', () => {
    const unclassified = thrown.filter(
      (m) => classifyVoteError(new Error(`[ESA-7006] Failed to vote: ${m}`)) === null,
    );
    expect(unclassified).toEqual([]);
  });

  it('분류 규칙이 낡지 않았다 — 매칭 문자열이 실제 SQL 에 있다', () => {
    expect(VOTE_ERROR_MATCHES.filter((needle) => !MIGRATION.includes(needle))).toEqual([]);
  });

  it.each([
    ['vote target not found', 404],
    ['unknown user', 403],
    ['invalid target type', 400],
    ['invalid vote direction', 400],
  ])('"%s" → %i', (message, status) => {
    expect(classifyVoteError(new Error(`[ESA-7006] Failed to vote: ${message}`))?.status).toBe(status);
  });

  it('진짜 서버 오류는 분류하지 않는다 — 그때만 500 이 맞다', () => {
    expect(classifyVoteError(new Error('[ESA-7006] Failed to vote: connection terminated'))).toBeNull();
    expect(classifyVoteError(new Error('ECONNRESET'))).toBeNull();
    expect(classifyVoteError(null)).toBeNull();
  });

  /**
   * 숨겨진 글에 투표한 사용자가 받는 문구다. "서버 오류" 가 아니라
   * 무엇을 하면 되는지가 나와야 한다.
   */
  it('숨겨진 글 안내는 다음 행동을 알려 준다', () => {
    const mapped = classifyVoteError(new Error('[ESA-7006] Failed to vote: vote target not found'));
    expect(mapped?.message).toContain('새로고침');
    expect(mapped?.message).not.toContain('vote target');
  });
});

describe('투표 라우트가 분류기를 쓴다', () => {
  const route = readFileSync(
    join(REPO, 'src/app/api/community/[id]/vote/route.ts'),
    'utf8',
  );

  it('분류기를 통해 상태를 정한다', () => {
    expect(route).toContain("import { classifyVoteError } from '@/lib/community-error'");
    expect(route).toContain('classifyVoteError(err)');
    expect(route).toContain('mapped?.status ?? 500');
  });

  it('무조건 500 을 내던 자리가 남아 있지 않다', () => {
    expect(route).not.toMatch(/message: '투표를 반영하지 못했습니다\.' \},\s*\},\s*\{ status: 500 \}/);
  });
});
