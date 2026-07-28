-- ============================================================================
-- 008 — 답변 채택의 잠금 순서를 고정한다 (데드락 창 제거)
-- ============================================================================
--
-- 007 의 `accept_community_answer` 는 **답변 → 질문** 순서로 잠근 뒤,
-- "질문당 하나" 를 지키려고 형제 답변들을 UPDATE 한다:
--
--     SELECT … FROM community_answers WHERE id = p_answer_id FOR UPDATE;   -- ①
--     SELECT … FROM community_questions WHERE id = v_question_id FOR UPDATE; -- ②
--     UPDATE community_answers SET is_accepted = false
--       WHERE question_id = v_question_id AND is_accepted = true;          -- ③
--
-- ③ 이 **잠기지 않은 다른 답변 행**을 건드린다. 그래서 순환 대기가 생긴다
-- (2026-07-28 독립 심사 백엔드 좌석):
--
--     질문 Q, ans2 가 현재 채택 상태
--     A: accept(ans1) → ans1 잠금 → Q 잠금 성공
--     B: accept(ans2) → ans2 잠금 → Q 대기 (A 보유)
--     A: ③ 이 ans2 를 잠그려 함 → B 대기
--     → 순환 대기 = 40P01 deadlock detected
--
-- 전제는 "이미 채택된 답변이 있고 다른 답변을 동시에 채택" 이다. 두 사람이
-- 필요하지 않다 — **질문 작성자 한 사람의 더블클릭이나 클라이언트 재시도**로
-- 성립한다. 그리고 `classifyVoteError` 가 40P01 을 모르므로 500 이 나간다.
-- 오분류는 아니지만(서버 문제가 맞다) 정상 UI 조작에서 나는 500 이다.
--
-- 고치는 방법: **질문을 먼저 잠그고**, 그 질문의 답변들을 `ORDER BY id` 로
-- 한꺼번에 잠근다. 모든 트랜잭션이 같은 순서로 같은 행 집합을 잡으므로
-- 순환이 생기지 않는다.
--
-- 답변 → 질문 경로가 필요했던 이유(답변에서 question_id 를 얻어야 함)는
-- 잠금 없는 조회로 먼저 해결한다. 그 값이 낡을 수 있지만, 답변의
-- `question_id` 는 바뀌지 않으므로 안전하다.
--
-- 검증 조건(② ③ 은 007 그대로 유지):
--   ② 질문 작성자만 채택 · ③ 자기 답변 채택 금지 · hidden = false 재평가
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_community_answer(
  p_answer_id UUID,
  p_user_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_id UUID;
  v_answer_author TEXT;
  v_question_author TEXT;
  v_answer_visible BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'unknown user';
  END IF;

  -- 잠금 없이 소속 질문만 알아낸다. `question_id` 는 불변이라 낡지 않는다.
  SELECT question_id INTO v_question_id
  FROM community_answers
  WHERE id = p_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept target not found';
  END IF;

  -- ① 질문을 **먼저** 잠근다. 모든 트랜잭션이 같은 순서를 따른다.
  SELECT author_id INTO v_question_author
  FROM community_questions
  WHERE id = v_question_id AND hidden = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept target not found';
  END IF;

  IF v_question_author <> p_user_id THEN
    RAISE EXCEPTION 'only the question author can accept';
  END IF;

  -- ② 이 질문의 답변 전체를 id 순서로 잠근다. 아래 UPDATE 가 건드릴 행이
  --    모두 여기 포함되므로, 잠기지 않은 행을 나중에 잡는 일이 없다.
  PERFORM 1
  FROM community_answers
  WHERE question_id = v_question_id
  ORDER BY id
  FOR UPDATE;

  -- 잠근 뒤에 대상 답변의 상태를 다시 읽는다(그 사이 숨겨졌을 수 있다).
  SELECT author_id, (hidden = false) INTO v_answer_author, v_answer_visible
  FROM community_answers
  WHERE id = p_answer_id;

  IF NOT FOUND OR NOT v_answer_visible THEN
    RAISE EXCEPTION 'accept target not found';
  END IF;

  IF v_answer_author = p_user_id THEN
    RAISE EXCEPTION 'cannot accept own answer';
  END IF;

  UPDATE community_answers
  SET is_accepted = false
  WHERE question_id = v_question_id AND is_accepted = true AND id <> p_answer_id;

  UPDATE community_answers
  SET is_accepted = true
  WHERE id = p_answer_id;

  UPDATE community_questions
  SET status = 'resolved'
  WHERE id = v_question_id;

  RETURN v_question_id;
END;
$$;

-- `CREATE OR REPLACE` 는 기존 ACL 을 보존하지만, 007 과 같은 상태임을
-- 명시적으로 다시 선언한다 — 나중에 이 파일만 보고도 권한을 알 수 있게.
REVOKE ALL ON FUNCTION accept_community_answer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_community_answer(UUID, TEXT) TO service_role;
