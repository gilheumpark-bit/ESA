-- 007 — 자기 글 자기 추천 금지 + 답변 채택 경로.
--
-- 두 가지가 짝이다. 커뮤니티는 읽기 쪽만 지어져 있었다(2026-07-28 실측):
--   · `is_accepted` 는 답변 생성 시 false 로만 들어가고 이후 갱신이 없다.
--     src·supabase 전체에 UPDATE 0. 그런데 목록은 `is_accepted DESC` 로
--     정렬하고 화면은 채택 답변에 초록 테두리와 체크 배지를 그린다 —
--     절대 뜨지 않는 표시였다.
--   · `getUserReputation`(질문 5 · 답변 10 · 채택 15) 은 호출처 0 이다.
--     그래서 지금은 자기 투표에 결과가 없다. 하지만 `cast_community_vote`
--     에는 **자기 투표 금지가 없어서**, 평판을 화면에 붙이는 순간 자기 글
--     자기 추천이 곧바로 점수가 된다.
--
-- 채택을 여는 김에 그 구멍을 함께 막는다. 채택은 +15 로 투표(5·10)보다 크고,
-- 질문도 답변도 자기 것일 수 있으니 **자기 채택**이 더 큰 통로다.
--
-- 규칙:
--   ① 자기 글에는 투표할 수 없다(질문·답변 모두).
--   ② 답변 채택은 **질문 작성자만** 할 수 있다.
--   ③ 자기 답변은 채택할 수 없다.
--   ④ 질문당 채택은 하나다. 다시 채택하면 앞의 것이 풀린다.
--   ⑤ 숨겨진 글은 채택 대상이 아니다(투표와 같은 규율).

-- ============================================================================
-- PART 1 — 자기 투표 금지
-- ============================================================================

CREATE OR REPLACE FUNCTION cast_community_vote(
  p_target_type TEXT,
  p_target_id UUID,
  p_user_id TEXT,
  p_direction TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_votes INTEGER;
  previous_direction INTEGER;
  next_direction INTEGER;
  vote_delta INTEGER;
  target_author TEXT;
BEGIN
  IF p_target_type NOT IN ('question', 'answer') THEN
    RAISE EXCEPTION 'invalid target type';
  END IF;
  IF p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid vote direction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'unknown user';
  END IF;

  next_direction := CASE WHEN p_direction = 'up' THEN 1 ELSE -1 END;

  IF p_target_type = 'question' THEN
    SELECT votes, author_id INTO current_votes, target_author
    FROM community_questions
    WHERE id = p_target_id AND hidden = false
    FOR UPDATE;
  ELSE
    SELECT votes, author_id INTO current_votes, target_author
    FROM community_answers
    WHERE id = p_target_id AND hidden = false
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vote target not found';
  END IF;

  -- 자기 글 자기 추천 금지. 평판이 투표에서 나오므로 이걸 열어 두면
  -- 글을 쓰는 것만으로 점수가 오른다.
  IF target_author = p_user_id THEN
    RAISE EXCEPTION 'cannot vote on own post';
  END IF;

  SELECT direction INTO previous_direction
  FROM community_votes
  WHERE user_id = p_user_id
    AND target_type = p_target_type
    AND target_id = p_target_id;

  IF previous_direction IS NULL THEN
    INSERT INTO community_votes (user_id, target_type, target_id, direction)
    VALUES (p_user_id, p_target_type, p_target_id, next_direction);
    vote_delta := next_direction;
  ELSIF previous_direction = next_direction THEN
    DELETE FROM community_votes
    WHERE user_id = p_user_id
      AND target_type = p_target_type
      AND target_id = p_target_id;
    vote_delta := -next_direction;
  ELSE
    UPDATE community_votes
    SET direction = next_direction
    WHERE user_id = p_user_id
      AND target_type = p_target_type
      AND target_id = p_target_id;
    vote_delta := next_direction * 2;
  END IF;

  current_votes := current_votes + vote_delta;
  IF p_target_type = 'question' THEN
    UPDATE community_questions SET votes = current_votes WHERE id = p_target_id;
  ELSE
    UPDATE community_answers SET votes = current_votes WHERE id = p_target_id;
  END IF;

  RETURN current_votes;
END;
$$;

REVOKE ALL ON FUNCTION cast_community_vote(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cast_community_vote(TEXT, UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- PART 2 — 답변 채택
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'unknown user';
  END IF;

  SELECT question_id, author_id INTO v_question_id, v_answer_author
  FROM community_answers
  WHERE id = p_answer_id AND hidden = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept target not found';
  END IF;

  SELECT author_id INTO v_question_author
  FROM community_questions
  WHERE id = v_question_id AND hidden = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept target not found';
  END IF;

  -- ② 질문 작성자만 채택한다.
  IF v_question_author <> p_user_id THEN
    RAISE EXCEPTION 'only the question author can accept';
  END IF;

  -- ③ 자기 답변은 채택할 수 없다. 채택은 +15 로 투표보다 크고, 질문도
  --    답변도 자기 것일 수 있으니 여기가 더 큰 통로다.
  IF v_answer_author = p_user_id THEN
    RAISE EXCEPTION 'cannot accept own answer';
  END IF;

  -- ④ 질문당 하나. 다시 채택하면 앞의 것이 풀린다.
  UPDATE community_answers
  SET is_accepted = false
  WHERE question_id = v_question_id AND is_accepted = true;

  UPDATE community_answers
  SET is_accepted = true
  WHERE id = p_answer_id;

  UPDATE community_questions
  SET status = 'resolved'
  WHERE id = v_question_id;

  RETURN v_question_id;
END;
$$;

REVOKE ALL ON FUNCTION accept_community_answer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_community_answer(UUID, TEXT) TO service_role;
