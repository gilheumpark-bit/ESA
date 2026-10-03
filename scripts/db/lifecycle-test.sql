\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(ok BOOLEAN, label TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
INSERT INTO public.users(id) VALUES('owner'),('editor'),('viewer'),('rollback-owner'),('billing-owner'),('checkout-owner'),('concurrent-owner');
CREATE FUNCTION public.fixture_reject_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.user_id='rollback-owner' THEN RAISE EXCEPTION 'INJECTED_MEMBER_WRITE_FAILURE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fixture_reject_owner BEFORE INSERT ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_owner();
DO $$ BEGIN
 BEGIN PERFORM public.create_project_atomic('rollback','rollback-owner',NULL,'00000000-0000-4000-8000-000000000001');
 RAISE EXCEPTION 'EXPECTED_INJECTED_FAILURE';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'INJECTED_MEMBER_WRITE_FAILURE' THEN RAISE; END IF; END;
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.projects WHERE owner_id='rollback-owner'),'project and owner membership roll back together');
END $$;
DROP TRIGGER fixture_reject_owner ON public.project_members; DROP FUNCTION public.fixture_reject_owner();
DO $$ DECLARE p public.projects; second public.projects; approval public.project_approvals; rid UUID:=gen_random_uuid(); summary JSONB;
BEGIN
 p:=public.create_project_atomic('lifecycle','owner',NULL,'00000000-0000-4000-8000-000000000002');
 second:=public.create_project_atomic('lifecycle','owner',NULL,'00000000-0000-4000-8000-000000000002');
 PERFORM pg_temp.assert_true(p.id=second.id,'project creation retries reuse the original identity');
 INSERT INTO public.project_members(project_id,user_id,role) VALUES(p.id,'editor','editor'),(p.id,'viewer','viewer');
 BEGIN UPDATE public.projects SET status='approved' WHERE id=p.id; RAISE EXCEPTION 'APPROVAL_BYPASSED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROJECT_APPROVAL_REQUIRED' THEN RAISE; END IF; END;
 PERFORM pg_temp.assert_true((SELECT status='active' FROM public.projects WHERE id=p.id),'manual approved flag rejected');
 BEGIN PERFORM public.request_project_approval(p.id,'owner','viewer'); RAISE EXCEPTION 'VIEWER_APPROVED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROJECT_APPROVAL_FORBIDDEN' THEN RAISE; END IF; END;
 approval:=public.request_project_approval(p.id,'owner','editor');
 approval:=public.resolve_project_approval(p.id,'editor',true,'verified fixture');
 PERFORM pg_temp.assert_true((SELECT status='approved' AND approved_revision=revision FROM public.projects WHERE id=p.id),'approval binds reviewer and current revision');
 INSERT INTO public.calculation_receipts(id,user_id) VALUES(rid,'owner');
 INSERT INTO public.project_calculations(project_id,receipt_id) VALUES(p.id,rid);
 PERFORM pg_temp.assert_true((SELECT status='active' AND revision=2 AND approved_revision IS NULL FROM public.projects WHERE id=p.id),'new calculation invalidates the approval');
 approval:=public.request_project_approval(p.id,'owner','editor');
 UPDATE public.projects SET name='changed' WHERE id=p.id;
 BEGIN PERFORM public.resolve_project_approval(p.id,'editor',true,NULL); RAISE EXCEPTION 'STALE_APPROVAL_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROJECT_APPROVAL_STALE' THEN RAISE; END IF; END;
 PERFORM pg_temp.assert_true((SELECT revision=3 AND status='active' FROM public.projects WHERE id=p.id),'late approval of an old revision rejected');
 INSERT INTO public.share_links(project_id,created_by,token) VALUES(p.id,'editor',repeat('a',64));
 DELETE FROM public.project_members WHERE project_id=p.id AND user_id='editor';
 PERFORM pg_temp.assert_true((SELECT revoked_at IS NOT NULL FROM public.share_links WHERE token=repeat('a',64)),'membership removal revokes existing bearer links atomically');
 INSERT INTO public.project_members(project_id,user_id,role) VALUES(p.id,'editor','editor');
 PERFORM pg_temp.assert_true((SELECT revoked_at IS NOT NULL FROM public.share_links WHERE token=repeat('a',64)),'rejoining does not revive revoked links');
 INSERT INTO public.share_links(project_id,created_by,token) VALUES(p.id,'editor',repeat('b',64));
 UPDATE public.project_members SET role='viewer' WHERE project_id=p.id AND user_id='editor';
 PERFORM pg_temp.assert_true((SELECT revoked_at IS NOT NULL FROM public.share_links WHERE token=repeat('b',64)),'role downgrade revokes issued links');
 summary:=public.list_user_project_summaries('owner','owned',50,0);
 PERFORM pg_temp.assert_true(jsonb_array_length(summary)=1 AND (summary->0->>'calculationCount')::int=1 AND (summary->0->>'memberCount')::int=3,'summary returns exact counts without loading child rows');
 PERFORM pg_temp.assert_true(jsonb_array_length(public.list_user_project_summaries('rollback-owner','all',50,0))=0,'project summaries preserve user isolation');
END $$;
DO $$ DECLARE a JSONB; b JSONB; result TEXT;
BEGIN
 a:=public.acquire_checkout_intent('checkout-owner','pro_monthly','https://app.example.invalid/settings');
 b:=public.acquire_checkout_intent('checkout-owner','pro_monthly','https://app.example.invalid/settings');
 PERFORM pg_temp.assert_true(a->>'id'=b->>'id','retried purchase intent keeps the same idempotency identity');
 BEGIN PERFORM public.acquire_checkout_intent('checkout-owner','team_monthly','https://app.example.invalid/settings'); RAISE EXCEPTION 'SECOND_CHECKOUT_ALLOWED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'BILLING_CHECKOUT_PENDING' THEN RAISE; END IF; END;
 PERFORM pg_temp.assert_true(public.bind_stripe_customer('checkout-owner','cus_checkout')='cus_checkout','customer identity binds to the account');
 PERFORM pg_temp.assert_true(public.complete_checkout_intent('checkout-owner',(a->>'id')::uuid,'cs_fixture','https://checkout.example.invalid/session'),'session result persists on the same intent');
 PERFORM pg_temp.assert_true(NOT public.complete_checkout_intent('checkout-owner',gen_random_uuid(),'cs_other','https://checkout.example.invalid/other'),'stale intent cannot overwrite a new intent');
 result:=public.apply_stripe_subscription_event('evt_old','2026-01-01','created','billing-owner','cus_billing','sub_old','active','price_pro','pro','2030-01-01');
 result:=public.apply_stripe_subscription_event('evt_new','2026-01-02','created','billing-owner','cus_billing','sub_new','active','price_pro','pro','2030-01-01');
 result:=public.apply_stripe_subscription_event('evt_old_cancel','2026-01-03','deleted','billing-owner','cus_billing','sub_old','canceled','price_pro','free','2030-01-01');
 PERFORM pg_temp.assert_true((SELECT tier='pro' AND stripe_subscription_id='sub_new' FROM public.users WHERE id='billing-owner'),'older subscription cancellation cannot remove an active different subscription');
 result:=public.apply_stripe_subscription_event('evt_old_cancel','2026-01-03','deleted','billing-owner','cus_billing','sub_old','canceled','price_pro','free','2030-01-01');
 PERFORM pg_temp.assert_true(result='duplicate','webhook event id is idempotent');
 result:=public.apply_stripe_subscription_event('evt_stale','2026-01-01','deleted','billing-owner','cus_billing','sub_new','canceled','price_pro','free','2030-01-01');
 PERFORM pg_temp.assert_true(result='stale' AND (SELECT tier='pro' FROM public.users WHERE id='billing-owner'),'out-of-order event checked against its own subscription');
 BEGIN PERFORM public.acquire_checkout_intent('billing-owner','team_monthly','https://app.example.invalid/settings'); RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_DUPLICATED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'BILLING_SUBSCRIPTION_EXISTS' THEN RAISE; END IF; END;
 PERFORM pg_temp.assert_true(NOT has_function_privilege('anon','public.acquire_checkout_intent(text,text,text)','EXECUTE'),'anonymous role cannot call privileged purchase RPC');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.create_project_atomic(text,text,text,uuid)','EXECUTE'),'browser auth role cannot forge a project owner through RPC');
 PERFORM pg_temp.assert_true(has_function_privilege('service_role','public.resolve_project_approval(uuid,text,boolean,text)','EXECUTE'),'verified server role can resolve a review');
END $$;
-- 011: entry points no application path uses stay closed, and the answer counter still works through its trigger.
DO $$
BEGIN
 PERFORM pg_temp.assert_true(NOT has_function_privilege('anon','public.increment_answer_count(uuid)','EXECUTE'),'anonymous role cannot inflate an answer count');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.increment_answer_count(uuid)','EXECUTE'),'browser auth role cannot inflate an answer count');
 PERFORM pg_temp.assert_true(NOT has_table_privilege('anon','public.audit_log','INSERT'),'anonymous role cannot append audit rows');
 PERFORM pg_temp.assert_true(NOT has_table_privilege('authenticated','public.audit_log','INSERT'),'browser auth role cannot append audit rows');
 PERFORM pg_temp.assert_true(has_table_privilege('service_role','public.audit_log','INSERT'),'server role can still append audit rows');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_log' AND policyname='audit_insert_service'),'permissive audit insert policy is gone');
 PERFORM pg_temp.assert_true(has_function_privilege('service_role','public.increment_answer_count(uuid)','EXECUTE'),'server role keeps the answer counter');
END $$;
-- The insert runs as the application's role, not as the fixture superuser (a superuser skips
-- EXECUTE checks, so the same insert as superuser could not fail). This fixture has no Supabase
-- default grants, so the table privileges the application role needs are granted here.
BEGIN;
GRANT INSERT ON public.community_questions, public.community_answers TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO public.community_questions(id,title,body,author_id) VALUES('00000000-0000-4000-8000-0000000000a1','fixture question','fixture body','owner');
INSERT INTO public.community_answers(question_id,body,author_id) VALUES('00000000-0000-4000-8000-0000000000a1','fixture answer','editor');
RESET ROLE;
COMMIT;
DO $$ BEGIN
 PERFORM pg_temp.assert_true((SELECT answer_count=1 FROM public.community_questions WHERE id='00000000-0000-4000-8000-0000000000a1'),'answer inserted by the server role still increments the count through the trigger');
END $$;
