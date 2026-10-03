import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canAcceptAnswer } from '../community-accept';

const base = { viewerId: 'asker', questionAuthorId: 'asker', answerAuthorId: 'helper', alreadyAccepted: false };

describe('답변 채택 버튼 노출', () => {
  it('질문 작성자는 남의 답변을 채택할 수 있다', () => {
    expect(canAcceptAnswer(base)).toBe(true);
  });

  it.each([
    ['비로그인', { viewerId: null }],
    ['질문 작성자가 아닌 사람', { viewerId: 'someone-else' }],
    ['자기 답변', { answerAuthorId: 'asker' }],
    ['이미 채택된 질문', { alreadyAccepted: true }],
  ])('%s 에게는 보이지 않는다', (_label, override) => {
    expect(canAcceptAnswer({ ...base, ...override })).toBe(false);
  });
});

/**
 * 채택 API(PATCH acceptAnswer)는 있었지만 화면에 버튼이 없어서 누구도 쓸 수 없었다.
 * 화면이 그 동작 이름으로 요청하고 서버가 같은 이름을 받는지 양쪽에서 본다.
 */
describe('채택 버튼 ↔ 서버', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

  it('화면이 acceptAnswer 를 PATCH 로 보내고 서버가 받는다', () => {
    const page = read('src/app/(with-nav)/community/[id]/page.tsx');
    expect(page).toContain("action: 'acceptAnswer'");
    expect(page).toContain("method: 'PATCH'");
    expect(page).toContain('canAcceptAnswer(');
    expect(read('src/app/api/community/[id]/route.ts')).toContain("body?.action !== 'acceptAnswer'");
  });
});
