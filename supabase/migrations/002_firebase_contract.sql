-- ============================================================================
-- ESA Firebase identity and runtime contract upgrade
-- ============================================================================
-- Upgrades databases that already ran the original UUID-oriented migration 001.
-- New installations receive the same target shape directly from 001.

BEGIN;

-- Policies that depend on UUID ownership operators must be recreated after the
-- owner columns are converted to Firebase UID text values.
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS receipts_select_own ON calculation_receipts;
DROP POLICY IF EXISTS receipts_insert_own ON calculation_receipts;
DROP POLICY IF EXISTS receipts_delete_own ON calculation_receipts;
DROP POLICY IF EXISTS projects_select ON projects;
DROP POLICY IF EXISTS projects_insert_own ON projects;
DROP POLICY IF EXISTS projects_update_own ON projects;
DROP POLICY IF EXISTS projects_delete_own ON projects;
DROP POLICY IF EXISTS pm_select ON project_members;
DROP POLICY IF EXISTS pm_insert_owner ON project_members;
DROP POLICY IF EXISTS pm_delete_owner ON project_members;
DROP POLICY IF EXISTS pc_select ON project_calculations;
DROP POLICY IF EXISTS pc_insert ON project_calculations;
DROP POLICY IF EXISTS share_select ON share_links;
DROP POLICY IF EXISTS share_insert ON share_links;
DROP POLICY IF EXISTS share_delete ON share_links;
DROP POLICY IF EXISTS cq_insert_auth ON community_questions;
DROP POLICY IF EXISTS cq_update_own ON community_questions;
DROP POLICY IF EXISTS ca_insert_auth ON community_answers;
DROP POLICY IF EXISTS ca_update_own ON community_answers;
DROP POLICY IF EXISTS cv_insert_own ON community_votes;
DROP POLICY IF EXISTS cv_delete_own ON community_votes;
DROP POLICY IF EXISTS cr_insert_auth ON content_reports;
DROP POLICY IF EXISTS ev_select_own ON expert_verifications;
DROP POLICY IF EXISTS ev_insert_own ON expert_verifications;
DROP POLICY IF EXISTS ep_update_own ON expert_profiles;
DROP POLICY IF EXISTS notif_select_own ON notifications;
DROP POLICY IF EXISTS notif_update_own ON notifications;
DROP POLICY IF EXISTS np_select_own ON notification_preferences;
DROP POLICY IF EXISTS np_upsert_own ON notification_preferences;
DROP POLICY IF EXISTS "Users can view own reports" ON esva_reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON esva_reports;

-- Drop user foreign keys before changing UUID columns to text.
ALTER TABLE calculation_receipts DROP CONSTRAINT IF EXISTS calculation_receipts_user_id_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
ALTER TABLE community_questions DROP CONSTRAINT IF EXISTS community_questions_author_id_fkey;
ALTER TABLE community_answers DROP CONSTRAINT IF EXISTS community_answers_author_id_fkey;
ALTER TABLE community_votes DROP CONSTRAINT IF EXISTS community_votes_user_id_fkey;
ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_reporter_id_fkey;
ALTER TABLE expert_verifications DROP CONSTRAINT IF EXISTS expert_verifications_user_id_fkey;
ALTER TABLE expert_profiles DROP CONSTRAINT IF EXISTS expert_profiles_user_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_fkey;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_created_by_fkey;
ALTER TABLE expert_verifications DROP CONSTRAINT IF EXISTS expert_verifications_reviewed_by_fkey;
ALTER TABLE IF EXISTS project_approvals DROP CONSTRAINT IF EXISTS project_approvals_requester_id_fkey;
ALTER TABLE IF EXISTS project_approvals DROP CONSTRAINT IF EXISTS project_approvals_approver_id_fkey;
ALTER TABLE IF EXISTS field_safety_events DROP CONSTRAINT IF EXISTS field_safety_events_user_id_fkey;

ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tier_check;
ALTER TABLE users ADD CONSTRAINT users_tier_check
  CHECK (tier IN ('free', 'pro', 'team', 'enterprise'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin', 'support'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_event_created_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_stripe_customer_id
  ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_stripe_subscription_id
  ON users (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_stripe_subscription_status_check;
ALTER TABLE users ADD CONSTRAINT users_stripe_subscription_status_check
  CHECK (stripe_subscription_status IS NULL OR stripe_subscription_status IN
    ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'));

ALTER TABLE calculation_receipts ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE projects ALTER COLUMN owner_id TYPE TEXT USING owner_id::text;
ALTER TABLE project_members ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE community_questions ALTER COLUMN author_id TYPE TEXT USING author_id::text;
ALTER TABLE community_answers ALTER COLUMN author_id TYPE TEXT USING author_id::text;
ALTER TABLE community_votes ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE content_reports ALTER COLUMN reporter_id TYPE TEXT USING reporter_id::text;
ALTER TABLE expert_verifications ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE expert_profiles ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE notifications ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE notification_preferences ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE audit_log ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- Receipt vocabulary used by the API and history/report surfaces.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculation_receipts' AND column_name = 'calc_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculation_receipts' AND column_name = 'calculator_id'
  ) THEN
    ALTER TABLE calculation_receipts RENAME COLUMN calc_id TO calculator_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculation_receipts' AND column_name = 'result'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculation_receipts' AND column_name = 'outputs'
  ) THEN
    ALTER TABLE calculation_receipts RENAME COLUMN result TO outputs;
  END IF;
END $$;

ALTER TABLE calculation_receipts ADD COLUMN IF NOT EXISTS calculator_name TEXT;
ALTER TABLE calculation_receipts ADD COLUMN IF NOT EXISTS standard_ref TEXT;
ALTER TABLE calculation_receipts ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'ko';
ALTER TABLE calculation_receipts ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE calculation_receipts DROP CONSTRAINT IF EXISTS calculation_receipts_unit_system_check;
UPDATE calculation_receipts
SET unit_system = CASE WHEN lower(unit_system) = 'imperial' THEN 'Imperial' ELSE 'SI' END;
ALTER TABLE calculation_receipts ALTER COLUMN unit_system SET DEFAULT 'SI';
ALTER TABLE calculation_receipts ADD CONSTRAINT calculation_receipts_unit_system_check
  CHECK (unit_system IN ('SI', 'Imperial'));
ALTER TABLE calculation_receipts DROP CONSTRAINT IF EXISTS calculation_receipts_difficulty_level_check;
ALTER TABLE calculation_receipts ADD CONSTRAINT calculation_receipts_difficulty_level_check
  CHECK (difficulty_level IN ('basic', 'intermediate', 'advanced', 'expert'));
DROP INDEX IF EXISTS idx_receipts_calc_id;
CREATE INDEX IF NOT EXISTS idx_receipts_calculator_id ON calculation_receipts (calculator_id);

-- Collaboration tables now use the existing projects/junction/share tables.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
UPDATE projects SET status = 'archived' WHERE status = 'deleted';
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'active', 'review', 'approved', 'archived'));

ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
UPDATE project_members SET role = 'owner' WHERE role = 'admin';
ALTER TABLE project_members ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));
ALTER TABLE project_members ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_identity_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_identity_check
  CHECK (user_id IS NOT NULL OR email IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_email
  ON project_members (project_id, email) WHERE email IS NOT NULL;

ALTER TABLE share_links ADD COLUMN IF NOT EXISTS created_by TEXT;
UPDATE share_links sl
SET created_by = p.owner_id
FROM projects p
WHERE p.id = sl.project_id AND sl.created_by IS NULL;
ALTER TABLE share_links ALTER COLUMN created_by SET NOT NULL;

CREATE TABLE IF NOT EXISTS project_approvals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL,
  approver_id  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  comment      TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_project_approvals_project ON project_approvals (project_id);
CREATE INDEX IF NOT EXISTS idx_project_approvals_approver ON project_approvals (approver_id, status);
ALTER TABLE project_approvals ENABLE ROW LEVEL SECURITY;

-- Community moderation and expert review columns used by server writers.
ALTER TABLE community_questions ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE community_questions ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE community_questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE community_answers ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE community_answers ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_reports_actor
  ON content_reports (content_type, content_id, reporter_id);

ALTER TABLE expert_verifications DROP CONSTRAINT IF EXISTS expert_verifications_status_check;
UPDATE expert_verifications SET status = 'verified' WHERE status = 'approved';
ALTER TABLE expert_verifications ADD CONSTRAINT expert_verifications_status_check
  CHECK (status IN ('pending', 'verified', 'rejected'));
ALTER TABLE expert_verifications ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE expert_verifications ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE expert_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS calc_complete BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS community_answers BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ALTER COLUMN email SET DEFAULT false;

CREATE TABLE IF NOT EXISTS feedback (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL CHECK (type IN ('calculation', 'search')),
  target_id  TEXT NOT NULL,
  rating     TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  comment    TEXT,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_target ON feedback (type, target_id, created_at DESC);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS contact_messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email      TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'deleted')),
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 year')
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status, created_at DESC);
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS field_safety_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('sos', 'completed')),
  work_site     TEXT NOT NULL,
  worker_count  INT,
  occurred_at   TIMESTAMPTZ NOT NULL,
  receipt_hash  TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_field_events_user ON field_safety_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_events_session ON field_safety_events (session_id, created_at DESC);
ALTER TABLE field_safety_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit_log ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;
UPDATE audit_log SET tenant_id = 'esa' WHERE tenant_id IS NULL;
ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'esva_reports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE esva_reports ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END $$;

-- Restore foreign keys using the Firebase UID text identity.
ALTER TABLE calculation_receipts ADD CONSTRAINT calculation_receipts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE project_members ADD CONSTRAINT project_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE community_questions ADD CONSTRAINT community_questions_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE community_answers ADD CONSTRAINT community_answers_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE community_votes ADD CONSTRAINT community_votes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE expert_verifications ADD CONSTRAINT expert_verifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE expert_verifications ADD CONSTRAINT expert_verifications_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expert_profiles ADD CONSTRAINT expert_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE share_links ADD CONSTRAINT share_links_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE project_approvals ADD CONSTRAINT project_approvals_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE project_approvals ADD CONSTRAINT project_approvals_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE field_safety_events ADD CONSTRAINT field_safety_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Atomic vote toggle. The service role is the only direct caller.
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
BEGIN
  IF p_target_type NOT IN ('question', 'answer') OR p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid vote request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'unknown user';
  END IF;
  next_direction := CASE WHEN p_direction = 'up' THEN 1 ELSE -1 END;
  IF p_target_type = 'question' THEN
    SELECT votes INTO current_votes FROM community_questions
    WHERE id = p_target_id AND hidden = false FOR UPDATE;
  ELSE
    SELECT votes INTO current_votes FROM community_answers
    WHERE id = p_target_id AND hidden = false FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'vote target not found'; END IF;

  SELECT direction INTO previous_direction FROM community_votes
  WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;
  IF previous_direction IS NULL THEN
    INSERT INTO community_votes (user_id, target_type, target_id, direction)
    VALUES (p_user_id, p_target_type, p_target_id, next_direction);
    vote_delta := next_direction;
  ELSIF previous_direction = next_direction THEN
    DELETE FROM community_votes
    WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;
    vote_delta := -next_direction;
  ELSE
    UPDATE community_votes SET direction = next_direction
    WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;
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

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id           TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION apply_stripe_subscription_event(
  p_event_id TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_event_type TEXT,
  p_user_id TEXT,
  p_customer_id TEXT,
  p_subscription_id TEXT,
  p_subscription_status TEXT,
  p_price_id TEXT,
  p_tier TEXT,
  p_current_period_end TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_event_time TIMESTAMPTZ;
BEGIN
  IF p_tier NOT IN ('free', 'pro', 'team') THEN RAISE EXCEPTION 'invalid subscription tier'; END IF;
  IF p_subscription_status NOT IN
    ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused') THEN
    RAISE EXCEPTION 'invalid subscription status';
  END IF;

  INSERT INTO stripe_webhook_events (id, event_type, user_id, created_at)
  VALUES (p_event_id, p_event_type, p_user_id, p_event_created_at)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;

  SELECT stripe_event_created_at INTO previous_event_time
  FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown billing user'; END IF;
  IF previous_event_time IS NOT NULL AND previous_event_time > p_event_created_at THEN RETURN 'stale'; END IF;

  UPDATE users
  SET tier = p_tier,
      stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
      stripe_subscription_status = p_subscription_status,
      stripe_price_id = p_price_id,
      stripe_event_id = p_event_id,
      stripe_event_created_at = p_event_created_at,
      subscription_current_period_end = p_current_period_end,
      updated_at = now()
  WHERE id = p_user_id;
  RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION apply_stripe_subscription_event(
  TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_stripe_subscription_event(
  TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

-- Restore ownership policies with explicit text comparison.
CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid()::text = id);
-- No direct user UPDATE policy: role, tier, and billing entitlement are server-owned.
CREATE POLICY receipts_select_own ON calculation_receipts FOR SELECT
  USING (auth.uid()::text = user_id OR is_public = true);
CREATE POLICY receipts_insert_own ON calculation_receipts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY receipts_delete_own ON calculation_receipts FOR DELETE
  USING (auth.uid()::text = user_id);
CREATE POLICY projects_select ON projects FOR SELECT USING (
  auth.uid()::text = owner_id OR EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()::text
  )
);
CREATE POLICY projects_insert_own ON projects FOR INSERT WITH CHECK (auth.uid()::text = owner_id);
CREATE POLICY projects_update_own ON projects FOR UPDATE USING (auth.uid()::text = owner_id);
CREATE POLICY projects_delete_own ON projects FOR DELETE USING (auth.uid()::text = owner_id);
CREATE POLICY pm_select ON project_members FOR SELECT USING (
  auth.uid()::text = user_id OR EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text
  )
);
CREATE POLICY pm_insert_owner ON project_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
);
CREATE POLICY pm_delete_owner ON project_members FOR DELETE USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
);
CREATE POLICY pc_select ON project_calculations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND (
      p.owner_id = auth.uid()::text OR EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()::text
      )
    )
  )
);
CREATE POLICY pc_insert ON project_calculations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
);
CREATE POLICY share_select ON share_links FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
);
CREATE POLICY share_insert ON share_links FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
);
CREATE POLICY share_delete ON share_links FOR DELETE USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
);
CREATE POLICY cq_insert_auth ON community_questions FOR INSERT WITH CHECK (auth.uid()::text = author_id);
CREATE POLICY cq_update_own ON community_questions FOR UPDATE USING (auth.uid()::text = author_id);
CREATE POLICY ca_insert_auth ON community_answers FOR INSERT WITH CHECK (auth.uid()::text = author_id);
CREATE POLICY ca_update_own ON community_answers FOR UPDATE USING (auth.uid()::text = author_id);
CREATE POLICY cv_insert_own ON community_votes FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY cv_delete_own ON community_votes FOR DELETE USING (auth.uid()::text = user_id);
CREATE POLICY cr_insert_auth ON content_reports FOR INSERT WITH CHECK (auth.uid()::text = reporter_id);
CREATE POLICY ev_select_own ON expert_verifications FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY ev_insert_own ON expert_verifications FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY ep_update_own ON expert_profiles FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY notif_select_own ON notifications FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY notif_update_own ON notifications FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY np_select_own ON notification_preferences FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY np_upsert_own ON notification_preferences FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own reports" ON esva_reports FOR SELECT
  USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own reports" ON esva_reports FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- A year string alone does not prove an edition is currently authoritative.
-- Existing deployments are migrated fail-closed until a verification date is recorded.
ALTER TABLE calculation_receipts
  ADD COLUMN IF NOT EXISTS standard_verified_at TIMESTAMPTZ;
ALTER TABLE calculation_receipts
  ALTER COLUMN is_standard_current SET DEFAULT false;
UPDATE calculation_receipts
  SET is_standard_current = false
  WHERE standard_verified_at IS NULL AND is_standard_current = true;
ALTER TABLE calculation_receipts
  DROP CONSTRAINT IF EXISTS receipt_current_requires_verification;
ALTER TABLE calculation_receipts
  ADD CONSTRAINT receipt_current_requires_verification
  CHECK (NOT is_standard_current OR standard_verified_at IS NOT NULL);

COMMIT;
