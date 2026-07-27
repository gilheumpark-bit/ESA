/**
 * 협업 계층이 던지는 오류를 HTTP 상태로 옮긴다.
 *
 * `collaboration.ts` 는 호출자 잘못을 전부 `Error` 로 던진다 — 남의 영수증을
 * 프로젝트에 넣으려 했다, 멤버가 아니다, 소유자를 초대하려 했다. 라우트는
 * 그중 `Insufficient permissions` 하나만 403 으로 옮기고 나머지를 **500**
 * 으로 냈다(실측 2026-07-28).
 *
 * 500 은 "서버 잘못" 이라는 뜻이다. 운영 알람을 울리고, 호출자에게는 무엇을
 * 고쳐야 하는지 안 알려 준다. 이 리포엔 이미 규범이 있다 — 본문 파싱 실패를
 * 400 으로 바꾼 11 개 라우트(`body-parse-guard.test.ts`)와 `gate:pdf` 의
 * "비PDF: 500 이 아니라 400 정직 거부" 가 같은 결정이다.
 *
 * 메시지 문자열로 가르는 것은 무르다 — 문구를 바꾸면 조용히 500 으로
 * 돌아간다. 그래서 `collaboration-error.test.ts` 가 `collaboration.ts` 의
 * throw 를 전부 긁어 여기서 분류되는지 대조한다. 새 메시지를 추가하면
 * 그 검사가 깨진다.
 */

export interface CollabErrorMapping {
  status: number;
  /** 사용자에게 보일 문구. 내부 메시지를 그대로 노출하지 않는다. */
  message: string;
}

const RULES: Array<{ match: string; status: number; message: string }> = [
  {
    match: 'Insufficient permissions',
    status: 403,
    message: '이 작업을 수행할 권한이 없습니다.',
  },
  {
    match: 'not a member of this project',
    status: 403,
    message: '이 프로젝트의 멤버가 아닙니다.',
  },
  {
    match: 'Receipt not found or not owned',
    status: 404,
    message: '본인이 만든 계산 영수증만 프로젝트에 담을 수 있습니다.',
  },
  {
    match: 'Cannot invite a member as owner',
    status: 400,
    message: '소유자 권한으로는 초대할 수 없습니다.',
  },
  {
    match: 'Member identity is required',
    status: 400,
    message: '대상 멤버를 지정해 주세요.',
  },
  {
    match: 'Owner cannot remove themselves',
    status: 400,
    message: '소유자는 스스로를 제외할 수 없습니다. 소유권을 넘긴 뒤 다시 시도하세요.',
  },
];

/**
 * 아는 호출자 오류면 그 매핑을, 모르면 `null` 을 준다.
 * `null` 은 진짜 서버 오류라는 뜻이다 — 그때만 500 이 맞다.
 */
export function classifyCollabError(error: unknown): CollabErrorMapping | null {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const rule = RULES.find((item) => raw.includes(item.match));
  return rule ? { status: rule.status, message: rule.message } : null;
}

/** 검사가 대조할 수 있도록 규칙 문자열을 내보낸다. */
export const COLLAB_ERROR_MATCHES: readonly string[] = RULES.map((r) => r.match);
