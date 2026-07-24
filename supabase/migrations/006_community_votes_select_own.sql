-- 006 — community_votes 의 개별 표를 본인 것만 읽도록 축소한다.
--
-- 001 의 cv_select_all(FOR SELECT USING (true)) 은 이 테이블을 통째로 공개했다.
-- 한 행에 user_id · target_type · target_id · direction(-1/1) 이 함께 있어
-- "누가 어떤 글에 반대표를 던졌는지" 가 그대로 조회된다. 지금은 브라우저
-- Supabase 클라이언트 호출처가 0 이라 도달 경로가 없지만, 클라이언트를 붙이는
-- 순간 열리는 종류의 노출이라 경로가 생기기 전에 닫는다.
--
-- 화면의 득표수는 이 테이블이 아니라 community_questions.votes ·
-- community_answers.votes 비정규화 컬럼에서 온다(001). 개별 표를 본인 한정으로
-- 좁혀도 집계 표시는 영향을 받지 않는다.
--
-- 004 가 cq/ca_select_all 을 hidden = false 로 교체한 것과 같은 형태의 축소다.

BEGIN;

DROP POLICY IF EXISTS cv_select_all ON public.community_votes;

CREATE POLICY cv_select_own
  ON public.community_votes
  FOR SELECT
  USING (auth.uid()::text = user_id);

COMMIT;
