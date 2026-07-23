BEGIN;

DROP POLICY IF EXISTS cq_select_all ON public.community_questions;
CREATE POLICY cq_select_visible
  ON public.community_questions
  FOR SELECT
  USING (hidden = false);

DROP POLICY IF EXISTS ca_select_all ON public.community_answers;
CREATE POLICY ca_select_visible
  ON public.community_answers
  FOR SELECT
  USING (hidden = false);

COMMIT;
