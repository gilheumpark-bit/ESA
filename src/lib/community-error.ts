/**
 * 커뮤니티 투표 RPC 가 던지는 오류를 HTTP 상태로 옮긴다.
 *
 * `cast_community_vote` 는 호출자 잘못을 `RAISE EXCEPTION` 으로 던지고,
 * `lib/community.ts` 가 그걸 `[ESA-7006] Failed to vote: …` 로 감싼다.
 * 투표 라우트는 그 전부를 **500** 으로 냈다(실측 2026-07-28).
 *
 * 가장 흔한 경우가 문제다: 신고 3 회면 글이 자동으로 숨겨지는데
 * (`AUTO_HIDE_THRESHOLD`), RPC 는 숨겨진 글을 투표 대상에서 뺀다
 * (`hidden = false`). 화면을 열어 둔 사이에 글이 숨겨지면 정상적인 경합인데
 * 500 이 나가 운영 알람이 울리고, 사용자는 "투표를 반영하지 못했습니다" 만
 * 보고 왜인지 모른다.
 *
 * `collaboration-error.ts` 와 같은 규범이다 — 호출자 잘못을 500 으로
 * 뭉개지 않는다. 다만 정본이 다르다: 여기 문구는 마이그레이션 SQL 의
 * `RAISE EXCEPTION` 이고, `community-error.test.ts` 가 그 SQL 을 긁어
 * 전부 분류되는지 대조한다.
 */

export interface VoteErrorMapping {
  status: number;
  message: string;
}

const RULES: Array<{ match: string; status: number; message: string }> = [
  {
    match: 'vote target not found',
    status: 404,
    message: '이미 삭제되었거나 숨겨진 글입니다. 목록을 새로고침해 주세요.',
  },
  {
    match: 'unknown user',
    status: 403,
    message: '계정 정보를 확인하지 못했습니다. 다시 로그인해 주세요.',
  },
  {
    match: 'invalid target type',
    status: 400,
    message: '투표 대상 종류가 올바르지 않습니다.',
  },
  {
    match: 'invalid vote direction',
    status: 400,
    message: '투표 방향이 올바르지 않습니다.',
  },
  {
    // 002 판의 RPC 는 대상 종류와 방향을 한 문구로 묶어 던졌다. 007 이
    // 함수를 교체했지만 중간 버전에서 멈춘 배포는 아직 이걸 낸다 —
    // 검사가 **모든 함수 정의**를 훑다가 찾아냈다(2026-07-28).
    match: 'invalid vote request',
    status: 400,
    message: '투표 요청 형식이 올바르지 않습니다.',
  },
  {
    match: 'cannot vote on own post',
    status: 403,
    message: '자기 글에는 추천할 수 없습니다.',
  },
  {
    match: 'accept target not found',
    status: 404,
    message: '이미 삭제되었거나 숨겨진 답변입니다. 목록을 새로고침해 주세요.',
  },
  {
    match: 'only the question author can accept',
    status: 403,
    message: '질문을 올린 분만 답변을 채택할 수 있습니다.',
  },
  {
    match: 'cannot accept own answer',
    status: 403,
    message: '자기 답변은 채택할 수 없습니다.',
  },
];

/**
 * 아는 호출자 오류면 그 매핑을, 모르면 `null`.
 * `null` 은 진짜 서버 오류라는 뜻이다 — 그때만 500 이 맞다.
 */
export function classifyVoteError(error: unknown): VoteErrorMapping | null {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const rule = RULES.find((item) => raw.includes(item.match));
  return rule ? { status: rule.status, message: rule.message } : null;
}

/** 검사가 대조할 수 있도록 규칙 문자열을 내보낸다. */
export const VOTE_ERROR_MATCHES: readonly string[] = RULES.map((r) => r.match);
