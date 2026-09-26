-- Server-owned project lifecycle. Deploy this migration before the corresponding API.
BEGIN;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS approved_revision BIGINT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS creation_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS projects_creation_request ON public.projects(owner_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;
ALTER TABLE public.project_approvals ADD COLUMN IF NOT EXISTS target_revision BIGINT;
ALTER TABLE public.share_links ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS share_links_project_live ON public.share_links(project_id, created_by) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_updated_page ON public.projects(updated_at DESC, id DESC);
-- A legacy manual label is not a verifiable approval of the current content.
UPDATE public.projects SET status = 'review', approved_revision = NULL WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.create_project_atomic(
  p_name TEXT, p_owner_id TEXT, p_description TEXT, p_request_id UUID
) RETURNS public.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.projects;
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 200 OR length(coalesce(p_description, '')) > 10000 THEN
    RAISE EXCEPTION 'PROJECT_INPUT_INVALID';
  END IF;
  -- Serialize retries per owner. The project and owner member commit or roll back together.
  PERFORM 1 FROM public.users WHERE id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_OWNER_UNKNOWN'; END IF;
  SELECT * INTO result FROM public.projects WHERE owner_id = p_owner_id AND creation_request_id = p_request_id;
  IF FOUND THEN
    IF result.name IS DISTINCT FROM trim(p_name) OR result.description IS DISTINCT FROM p_description THEN
      RAISE EXCEPTION 'PROJECT_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN result;
  END IF;
  INSERT INTO public.projects(name, description, owner_id, creation_request_id)
    VALUES(trim(p_name), p_description, p_owner_id, p_request_id) RETURNING * INTO result;
  INSERT INTO public.project_members(project_id, user_id, role, joined_at)
    VALUES(result.id, p_owner_id, 'owner', now());
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_project_atomic(TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_atomic(TEXT,TEXT,TEXT,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.list_user_project_rows(p_user_id TEXT, p_filter TEXT, p_limit INT, p_offset INT)
RETURNS SETOF public.projects LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.* FROM public.projects p
  WHERE p_filter IN ('all','owned','shared') AND (
    (p_filter IN ('all','owned') AND p.owner_id = p_user_id)
    OR (p_filter IN ('all','shared') AND p.owner_id <> p_user_id AND EXISTS(
      SELECT 1 FROM public.project_members m WHERE m.project_id=p.id AND m.user_id=p_user_id)))
  ORDER BY p.updated_at DESC, p.id DESC LIMIT greatest(1, least(p_limit, 101)) OFFSET greatest(0, least(p_offset, 100000));
$$;
REVOKE ALL ON FUNCTION public.list_user_project_rows(TEXT,TEXT,INT,INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_project_rows(TEXT,TEXT,INT,INT) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_project_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.revision := OLD.revision + 1;
    NEW.approved_revision := NULL;
    IF NEW.status IN ('approved','review') THEN NEW.status := 'active'; END IF;
  END IF;
  IF NEW.status = 'approved' AND NOT EXISTS(
    SELECT 1 FROM public.project_approvals a JOIN public.project_members m
      ON m.project_id=a.project_id AND m.user_id=a.approver_id AND m.role IN ('owner','editor')
    WHERE a.project_id=NEW.id AND a.status='approved' AND a.target_revision=NEW.revision
      AND a.approver_id<>a.requester_id AND a.resolved_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'PROJECT_APPROVAL_REQUIRED'; END IF;
  IF NEW.status='approved' THEN NEW.approved_revision:=NEW.revision;
  ELSE NEW.approved_revision:=NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_revision_guard BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_revision();

CREATE OR REPLACE FUNCTION public.invalidate_project_calculation_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.projects SET revision=revision+1, approved_revision=NULL,
    status=CASE WHEN status IN ('approved','review') THEN 'active' ELSE status END, updated_at=now()
  WHERE id=coalesce(NEW.project_id, OLD.project_id);
  IF TG_OP='UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    UPDATE public.projects SET revision=revision+1, approved_revision=NULL,
      status=CASE WHEN status IN ('approved','review') THEN 'active' ELSE status END, updated_at=now() WHERE id=OLD.project_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER project_calculation_revision AFTER INSERT OR UPDATE OR DELETE ON public.project_calculations
 FOR EACH ROW EXECUTE FUNCTION public.invalidate_project_calculation_approval();

-- Serialize issuance with membership deletion/downgrade, not only a prior API check.
CREATE OR REPLACE FUNCTION public.require_share_issuer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE issuer_role TEXT;
BEGIN
  SELECT role INTO issuer_role FROM public.project_members WHERE project_id=NEW.project_id AND user_id=NEW.created_by FOR SHARE;
  IF NOT FOUND OR issuer_role NOT IN ('owner','editor') THEN RAISE EXCEPTION 'PROJECT_SHARE_FORBIDDEN'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER share_issuer_guard BEFORE INSERT ON public.share_links
 FOR EACH ROW EXECUTE FUNCTION public.require_share_issuer();

CREATE OR REPLACE FUNCTION public.revoke_removed_member_shares() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.role NOT IN ('owner','editor') THEN
    UPDATE public.share_links SET revoked_at=coalesce(revoked_at,now())
      WHERE project_id=OLD.project_id AND created_by=OLD.user_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER revoke_member_shares AFTER DELETE OR UPDATE ON public.project_members
 FOR EACH ROW EXECUTE FUNCTION public.revoke_removed_member_shares();

CREATE OR REPLACE FUNCTION public.request_project_approval(p_project_id UUID, p_requester TEXT, p_approver TEXT)
RETURNS public.project_approvals LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project public.projects; result public.project_approvals;
BEGIN
  SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
  IF p_requester=p_approver OR NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=p_requester AND role IN ('owner','editor'))
    OR NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=p_approver AND role IN ('owner','editor'))
    THEN RAISE EXCEPTION 'PROJECT_APPROVAL_FORBIDDEN'; END IF;
  SELECT * INTO result FROM public.project_approvals WHERE project_id=p_project_id AND approver_id=p_approver AND status='pending' AND target_revision=project.revision ORDER BY requested_at DESC LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.project_approvals(project_id, requester_id, approver_id, target_revision)
      VALUES(p_project_id,p_requester,p_approver,project.revision) RETURNING * INTO result;
  END IF;
  UPDATE public.projects SET status='review',updated_at=now() WHERE id=p_project_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.request_project_approval(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_project_approval(UUID,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_project_approval(p_project_id UUID, p_approver TEXT, p_approved BOOLEAN, p_comment TEXT)
RETURNS public.project_approvals LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project public.projects; approval public.project_approvals;
BEGIN
  SELECT * INTO project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=p_approver AND role IN ('owner','editor'))
    THEN RAISE EXCEPTION 'PROJECT_APPROVAL_FORBIDDEN'; END IF;
  SELECT * INTO approval FROM public.project_approvals WHERE project_id=p_project_id AND approver_id=p_approver
    AND requester_id<>p_approver AND status='pending' AND target_revision=project.revision ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_APPROVAL_STALE'; END IF;
  IF length(coalesce(p_comment,''))>10000 THEN RAISE EXCEPTION 'PROJECT_INPUT_INVALID'; END IF;
  UPDATE public.project_approvals SET status=CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    comment=p_comment,resolved_at=now() WHERE id=approval.id RETURNING * INTO approval;
  UPDATE public.projects SET status=CASE WHEN p_approved THEN 'approved' ELSE 'active' END, updated_at=now() WHERE id=p_project_id;
  RETURN approval;
END $$;
REVOKE ALL ON FUNCTION public.resolve_project_approval(UUID,TEXT,BOOLEAN,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_project_approval(UUID,TEXT,BOOLEAN,TEXT) TO service_role;
CREATE OR REPLACE FUNCTION public.list_user_project_summaries(p_user_id TEXT,p_filter TEXT,p_limit INT,p_offset INT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'description',coalesce(p.description,''),'status',p.status,'updatedAt',p.updated_at,
   'memberCount',(SELECT count(*) FROM public.project_members WHERE project_id=p.id),
   'calculationCount',(SELECT count(*) FROM public.project_calculations WHERE project_id=p.id),
   'userRole',CASE WHEN p.owner_id=p_user_id THEN 'owner' ELSE (SELECT role FROM public.project_members WHERE project_id=p.id AND user_id=p_user_id) END
 ) ORDER BY p.updated_at DESC,p.id DESC),'[]'::jsonb)
 FROM public.list_user_project_rows(p_user_id,p_filter,p_limit,p_offset) p;
$$;
REVOKE ALL ON FUNCTION public.list_user_project_summaries(TEXT,TEXT,INT,INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_project_summaries(TEXT,TEXT,INT,INT) TO service_role;
COMMIT;
