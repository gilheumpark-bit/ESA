import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyCollabError, COLLAB_ERROR_MATCHES } from '@/lib/collaboration-error';

/**
 * 호출자 잘못이 500 으로 나가지 않는지 본다.
 *
 * `collaboration.ts` 는 "남의 영수증이다" · "멤버가 아니다" · "소유자는
 * 스스로를 제외할 수 없다" 를 전부 `Error` 로 던진다. `projects/[id]` 는
 * 그중 `Insufficient permissions` 하나만 403 으로 옮기고 **나머지 다섯을
 * 500 으로 냈다**(실측 2026-07-28).
 *
 * 500 은 "서버 잘못" 이라는 뜻이다 — 운영 알람을 울리고, 호출자에게는
 * 무엇을 고쳐야 하는지 안 알려 준다. 이 리포엔 이미 같은 결정이 있다:
 * 본문 파싱 실패를 400 으로 바꾼 11 개 라우트(`body-parse-guard.test.ts`)와
 * `gate:pdf` 의 "비PDF: 500 이 아니라 400 정직 거부".
 *
 * 메시지 문자열로 가르는 것은 무르다 — 문구를 바꾸면 조용히 500 으로
 * 돌아간다. 그래서 아래 첫 검사가 `collaboration.ts` 의 throw 를 **전부
 * 긁어** 분류되는지 대조한다. 새 메시지를 추가하면 여기서 걸린다.
 */
const COLLAB = readFileSync(join(__dirname, '..', 'collaboration.ts'), 'utf8');

/** `throw new Error('[ESVA Collab] ...')` 의 문구를 전부 뽑는다. */
function thrownMessages(): string[] {
  const out = new Set<string>();
  for (const m of COLLAB.matchAll(/throw new Error\(\s*[`']\[ESVA Collab\]\s*([^`']+)/g)) {
    out.add(m[1].trim());
  }
  return [...out];
}

describe('협업 오류 → HTTP 상태', () => {
  const messages = thrownMessages();

  it('throw 를 실제로 긁어낸다 — 0건이면 아래 대조가 공회전이다', () => {
    expect(messages.length).toBeGreaterThan(4);
  });

  /**
   * 인프라 실패(`Failed to ...`)는 500 이 맞다. 호출자 잘못만 가른다.
   */
  it('호출자 잘못은 하나도 빠짐없이 분류된다', () => {
    const callerFaults = messages.filter((m) => !/^Failed to /.test(m));
    const unclassified = callerFaults.filter((m) => classifyCollabError(new Error(`[ESVA Collab] ${m}`)) === null);
    expect(unclassified).toEqual([]);
  });

  it('분류 규칙이 낡지 않았다 — 매칭 문자열이 실제 메시지에 있다', () => {
    const stale = COLLAB_ERROR_MATCHES.filter((needle) => !COLLAB.includes(needle));
    expect(stale).toEqual([]);
  });

  it.each([
    ['Insufficient permissions. Required: owner, got: viewer', 403],
    ['User is not a member of this project', 403],
    ['Receipt not found or not owned by this member', 404],
    ['Cannot invite a member as owner', 400],
    ['Member identity is required', 400],
    ['Owner cannot remove themselves', 400],
  ])('"%s" → %i', (message, status) => {
    expect(classifyCollabError(new Error(`[ESVA Collab] ${message}`))?.status).toBe(status);
  });

  it('진짜 서버 오류는 분류하지 않는다 — 그때만 500 이 맞다', () => {
    expect(classifyCollabError(new Error('[ESVA Collab] Failed to add calculation: timeout'))).toBeNull();
    expect(classifyCollabError(new Error('ECONNRESET'))).toBeNull();
    expect(classifyCollabError(null)).toBeNull();
  });

  it('내부 메시지를 사용자에게 그대로 흘리지 않는다', () => {
    const mapped = classifyCollabError(new Error('[ESVA Collab] Insufficient permissions. Required: owner|editor, got: viewer'));
    expect(mapped?.message).not.toContain('Insufficient');
    expect(mapped?.message).not.toContain('owner|editor');
  });
});

describe('프로젝트 라우트가 분류기를 쓴다', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'app', 'api', 'projects', '[id]', 'route.ts'),
    'utf8',
  );

  it('PATCH·DELETE 가 분류기를 통해 상태를 정한다', () => {
    expect(route).toContain("import { classifyCollabError } from '@/lib/collaboration-error'");
    expect((route.match(/classifyCollabError\(err\)/g) ?? []).length).toBe(2);
  });

  it('손으로 적은 문자열 매칭이 남아 있지 않다 — 두 벌이면 갈린다', () => {
    expect(route).not.toContain("message.includes('Insufficient permissions')");
    expect(route).not.toContain("message.includes('not a member')");
  });
});
