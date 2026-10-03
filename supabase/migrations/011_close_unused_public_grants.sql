-- Close two database entry points that no application code path uses.
--
-- 1) audit_log INSERT policy. 001 created `audit_insert_service ... WITH CHECK (true)`,
--    which lets any role holding INSERT on the table append rows. The application
--    writes audit rows only through the service role (src/lib/audit-log.ts), and the
--    service role bypasses RLS, so the policy grants nothing the app needs. With it
--    removed, RLS default-deny covers INSERT the same way `audit_select_service`
--    already covers SELECT.
--
-- 2) increment_answer_count(uuid). SECURITY DEFINER with the default PUBLIC execute
--    grant, so any API role could inflate a question's answer_count. Its only caller
--    is the `on_answer_insert` trigger function, which is SECURITY DEFINER itself and
--    therefore runs as the owner; revoking the public grant does not affect it.
--
-- Rollback: nothing here removes data or columns. Older application code keeps working
-- on this schema because it never used either entry point.

BEGIN;

DROP POLICY IF EXISTS audit_insert_service ON public.audit_log;
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_log TO service_role;

REVOKE ALL ON FUNCTION public.increment_answer_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_answer_count(UUID) TO service_role;

COMMIT;
