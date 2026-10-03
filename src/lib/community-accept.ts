/**
 * 채택 버튼을 보여 줄지 정한다. 최종 판정은 서버(`accept_community_answer`)가 한다 —
 * 여기서는 서버가 거절할 것이 분명한 경우에 버튼을 보이지 않을 뿐이다.
 */
export function canAcceptAnswer(input: {
  viewerId: string | null | undefined;
  questionAuthorId: string;
  answerAuthorId: string;
  alreadyAccepted: boolean;
}): boolean {
  if (!input.viewerId || input.alreadyAccepted) return false;
  if (input.viewerId !== input.questionAuthorId) return false;
  // 자기 답변은 채택할 수 없다(서버 규칙: cannot accept own answer).
  return input.answerAuthorId !== input.viewerId;
}
