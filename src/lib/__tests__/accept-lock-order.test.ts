import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **답변 채택의 잠금 순서를 고정한다.**
 *
 * 007 은 `답변 → 질문` 순서로 잠근 뒤, "질문당 하나" 를 지키려고 **잠기지
 * 않은 형제 답변 행**을 UPDATE 했다. 그래서 순환 대기가 생긴다
 * (2026-07-28 독립 심사 백엔드 좌석):
 *
 *     질문 Q, ans2 가 현재 채택 상태
 *     A: accept(ans1) → ans1 잠금 → Q 잠금 성공
 *     B: accept(ans2) → ans2 잠금 → Q 대기 (A 보유)
 *     A: 형제 UPDATE 가 ans2 를 잠그려 함 → B 대기
 *     → 40P01 deadlock detected → 500
 *
 * 두 사람이 필요하지 않다 — **질문 작성자 한 사람의 더블클릭**으로 성립한다.
 *
 * 이 검사는 SQL 텍스트를 본다. 실제 잠금 동작은 살아 있는 Postgres 없이
 * 재현할 수 없어서 **동작이 아니라 순서 규율**을 잠근다. 그 한계를 여기
 * 적어 둔다 — "데드락이 없음을 검증했다" 가 아니라 "잠금 순서가 되돌아가면
 * 깨진다" 다.
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

/** 가장 나중 마이그레이션의 `accept_community_answer` 정의를 쓴다. */
function latestAcceptFn(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const owning = files.filter((f) =>
    /CREATE OR REPLACE FUNCTION\s+accept_community_answer/i
      .test(readFileSync(join(MIGRATIONS, f), 'utf8')));
  expect(owning.length).toBeGreaterThan(0);
  return readFileSync(join(MIGRATIONS, owning[owning.length - 1]), 'utf8');
}

/**
 * `--` 주석을 걷어낸다.
 *
 * 008 의 머리말은 **고치기 전 코드를 인용**해 설명한다 — 거기 `FOR UPDATE`
 * 두 줄이 옛 순서(답변 → 질문) 그대로 들어 있다. 주석을 안 걷으면 검사가
 * 그 예시를 실제 코드로 읽고 "순서가 안 바뀌었다" 고 판정한다. 실제로
 * 그렇게 한 번 틀렸다 — 설명문이 검사를 속인 것이다.
 */
function stripSqlComments(src: string): string {
  return src.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');
}

describe('accept_community_answer — 잠금 순서', () => {
  const raw = latestAcceptFn();
  const sql = stripSqlComments(raw);

  it('정의를 실제로 찾았다 — 공회전 알람', () => {
    expect(sql).toMatch(/accept_community_answer/);
    expect(sql.length).toBeGreaterThan(500);
  });

  /**
   * 질문을 먼저 잠근다 — **문장 단위**로 본다.
   *
   * 처음엔 `FROM community_answers[\s\S]{0,200}?FOR UPDATE` 로 찾았다가
   * 틀렸다: 잠금 없는 조회(`SELECT question_id … FROM community_answers`)가
   * 200 자 뒤 **다른 문장의** `FOR UPDATE` 와 이어 붙어 매치됐다. 탐침이
   * 0 이 아니라 **엉뚱한 값**을 낸 경우다.
   */
  function lockedTablesInOrder(): string[] {
    return sql
      .split(';')
      .filter((stmt) => /FOR UPDATE/i.test(stmt))
      .map((stmt) => {
        const m = /FROM\s+(community_\w+)/i.exec(stmt);
        return m ? m[1].toLowerCase() : 'unknown';
      });
  }

  it('잠금 문장을 실제로 찾았다 — 공회전 알람', () => {
    expect(lockedTablesInOrder().length).toBeGreaterThanOrEqual(2);
  });

  it('질문을 답변보다 먼저 잠근다', () => {
    const order = lockedTablesInOrder();
    expect(order[0]).toBe('community_questions');
    expect(order).toContain('community_answers');
    expect(order.indexOf('community_questions'))
      .toBeLessThan(order.indexOf('community_answers'));
  });

  /**
   * UPDATE 가 건드릴 형제 행을 미리 **결정된 순서로** 잠근다.
   * `ORDER BY id` 가 없으면 두 트랜잭션이 다른 순서로 같은 행들을 잡을 수 있다.
   */
  it('그 질문의 답변 전체를 id 순서로 잠근다', () => {
    expect(sql).toMatch(/FROM community_answers\s+WHERE question_id[\s\S]{0,120}ORDER BY id\s+FOR UPDATE/i);
  });

  /** 잠근 뒤에 상태를 다시 읽는다 — 그 사이 숨겨졌을 수 있다. */
  it('잠금 후 대상 답변의 hidden 을 재평가한다', () => {
    expect(sql).toMatch(/hidden\s*=\s*false/i);
  });

  /** 007 의 검증 조건이 살아 있는지 — 순서를 고치며 잃지 않았는가. */
  it.each([
    ['질문 작성자만 채택', /only the question author can accept/],
    ['자기 답변 채택 금지', /cannot accept own answer/],
    ['알 수 없는 사용자 거부', /unknown user/],
  ])('%s 가 유지된다', (_label, re) => {
    expect(sql).toMatch(re);
  });

  /** 권한이 service_role 로만 열려 있다. */
  it('PUBLIC 실행 권한이 없다', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION accept_community_answer[\s\S]{0,60}FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION accept_community_answer[\s\S]{0,60}TO service_role/i);
  });
});
