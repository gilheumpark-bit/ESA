-- ============================================================================
-- ESA Initial Schema Migration
-- ============================================================================
-- All tables referenced by the ESA codebase.
-- Includes RLS policies, indexes, and helper RPC functions.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PART 1 — Core user table
-- ============================================================================

-- Users: core identity, tier, locale preferences
CREATE TABLE users (
  id          TEXT PRIMARY KEY, -- Firebase Auth uid
  email       TEXT UNIQUE,
  nickname    TEXT,
  role        TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'admin', 'support')),
  tier        TEXT NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free', 'pro', 'team', 'enterprise')),
  country_code TEXT DEFAULT 'KR',
  language_pref TEXT DEFAULT 'ko',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_subscription_status TEXT
                CHECK (stripe_subscription_status IS NULL OR stripe_subscription_status IN
                  ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  stripe_price_id TEXT,
  stripe_event_id TEXT,
  stripe_event_created_at TIMESTAMPTZ,
  subscription_current_period_end TIMESTAMPTZ,
  last_sign_in TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Core user accounts synced from Firebase Auth';

CREATE INDEX idx_users_email ON users (email);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid()::text = id);

-- User-controlled writes are intentionally not granted on this table: tier,
-- role, and Stripe entitlement fields are server-owned.

-- ============================================================================
-- PART 2 — Calculation receipts
-- ============================================================================

-- Calculation receipts: integrity-hashed record of every calculation
CREATE TABLE calculation_receipts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculator_id     TEXT,
  calculator_name   TEXT,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id        UUID,
  country_code      TEXT DEFAULT 'KR',
  applied_standard  TEXT,
  unit_system       TEXT DEFAULT 'SI'
                      CHECK (unit_system IN ('SI', 'Imperial')),
  difficulty_level  TEXT DEFAULT 'basic'
                      CHECK (difficulty_level IN ('basic', 'intermediate', 'advanced', 'expert')),
  inputs            JSONB NOT NULL DEFAULT '{}',
  outputs           JSONB NOT NULL DEFAULT '{}',
  steps             JSONB DEFAULT '[]',
  formula_used      TEXT,
  standard_ref      TEXT,
  lang              TEXT NOT NULL DEFAULT 'ko',
  metadata          JSONB NOT NULL DEFAULT '{}',
  standards_used    TEXT[] DEFAULT '{}',
  warnings          TEXT[] DEFAULT '{}',
  recommendations   TEXT[] DEFAULT '{}',
  disclaimer_text   TEXT,
  disclaimer_version TEXT,
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  standard_version  TEXT,
  standard_verified_at TIMESTAMPTZ,
  engine_version    TEXT,
  is_standard_current BOOLEAN NOT NULL DEFAULT false,
  receipt_hash      TEXT UNIQUE,
  share_token       TEXT UNIQUE,
  is_public         BOOLEAN DEFAULT false,
  ipfs_cid          TEXT,
  blockchain_tx     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE calculation_receipts IS 'Integrity-hashed calculation receipts with provenance and optional IPFS pinning';

CREATE INDEX idx_receipts_user_id    ON calculation_receipts (user_id);
CREATE INDEX idx_receipts_created_at ON calculation_receipts (created_at DESC);
CREATE INDEX idx_receipts_hash       ON calculation_receipts (receipt_hash);
CREATE INDEX idx_receipts_share      ON calculation_receipts (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_receipts_project    ON calculation_receipts (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_receipts_calculator_id ON calculation_receipts (calculator_id);

-- RLS
ALTER TABLE calculation_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_select_own ON calculation_receipts
  FOR SELECT USING (
    auth.uid()::text = user_id
    OR is_public = true
  );

CREATE POLICY receipts_insert_own ON calculation_receipts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY receipts_delete_own ON calculation_receipts
  FOR DELETE USING (auth.uid()::text = user_id);

-- ============================================================================
-- PART 3 — Projects and membership
-- ============================================================================

-- Projects: group calculations into named projects
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('draft', 'active', 'review', 'approved', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE projects IS 'User projects that group related calculations';

CREATE INDEX idx_projects_owner ON projects (owner_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Project members: collaboration on shared projects
CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at   TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  UNIQUE (project_id, user_id),
  UNIQUE (project_id, email)
);
COMMENT ON TABLE project_members IS 'Project collaboration membership';

CREATE INDEX idx_pm_project ON project_members (project_id);
CREATE INDEX idx_pm_user    ON project_members (user_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- project_members must exist before any project policy references it.
CREATE POLICY projects_select ON projects
  FOR SELECT USING (
    auth.uid()::text = owner_id
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()::text
    )
  );

CREATE POLICY projects_insert_own ON projects
  FOR INSERT WITH CHECK (auth.uid()::text = owner_id);

CREATE POLICY projects_update_own ON projects
  FOR UPDATE USING (auth.uid()::text = owner_id);

CREATE POLICY projects_delete_own ON projects
  FOR DELETE USING (auth.uid()::text = owner_id);

CREATE POLICY pm_select ON project_members
  FOR SELECT USING (
    auth.uid()::text = user_id
    OR EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text
    )
  );

CREATE POLICY pm_insert_owner ON project_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text
    )
  );

CREATE POLICY pm_delete_owner ON project_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text
    )
  );

-- Project-calculation junction table
CREATE TABLE project_calculations (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES calculation_receipts(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, receipt_id)
);
COMMENT ON TABLE project_calculations IS 'Many-to-many link between projects and calculation receipts';

ALTER TABLE project_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_select ON project_calculations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND (p.owner_id = auth.uid()::text
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()::text))
    )
  );

CREATE POLICY pc_insert ON project_calculations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text
    )
  );

-- ============================================================================
-- PART 4 — Share links
-- ============================================================================

-- Share links: password-protected, expirable project shares
CREATE TABLE share_links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at    TIMESTAMPTZ,
  password_hash TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE share_links IS 'Temporary share links for projects with optional password and expiry';

CREATE INDEX idx_share_token ON share_links (token);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY share_select ON share_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
  );

CREATE POLICY share_insert ON share_links
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
  );

CREATE POLICY share_delete ON share_links
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()::text)
  );

-- Project approval requests are mediated by Firebase-authenticated API routes.
CREATE TABLE project_approvals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approver_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  comment      TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
ALTER TABLE calculation_receipts
  ADD CONSTRAINT receipt_current_requires_verification
  CHECK (NOT is_standard_current OR standard_verified_at IS NOT NULL);
CREATE INDEX idx_project_approvals_project ON project_approvals (project_id);
CREATE INDEX idx_project_approvals_approver ON project_approvals (approver_id, status);
ALTER TABLE project_approvals ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5 — Community Q&A
-- ============================================================================

-- Community questions
CREATE TABLE community_questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  tags           TEXT[] DEFAULT '{}',
  author_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  standard_refs  TEXT[] DEFAULT '{}',
  calc_refs      TEXT[] DEFAULT '{}',
  votes          INT NOT NULL DEFAULT 0,
  answer_count   INT NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'closed', 'resolved')),
  hidden         BOOLEAN NOT NULL DEFAULT false,
  hidden_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE community_questions IS 'Community Q&A questions with standard/calculation cross-references';

CREATE INDEX idx_cq_author     ON community_questions (author_id);
CREATE INDEX idx_cq_created    ON community_questions (created_at DESC);
CREATE INDEX idx_cq_tags       ON community_questions USING GIN (tags);
CREATE INDEX idx_cq_status     ON community_questions (status);

ALTER TABLE community_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cq_select_all ON community_questions
  FOR SELECT USING (true);

CREATE POLICY cq_insert_auth ON community_questions
  FOR INSERT WITH CHECK (auth.uid()::text = author_id);

CREATE POLICY cq_update_own ON community_questions
  FOR UPDATE USING (auth.uid()::text = author_id);

-- Community answers
CREATE TABLE community_answers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id    UUID NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  author_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_expert      BOOLEAN NOT NULL DEFAULT false,
  standard_refs  TEXT[] DEFAULT '{}',
  votes          INT NOT NULL DEFAULT 0,
  is_accepted    BOOLEAN NOT NULL DEFAULT false,
  hidden         BOOLEAN NOT NULL DEFAULT false,
  hidden_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE community_answers IS 'Answers to community questions, with expert badge support';

CREATE INDEX idx_ca_question ON community_answers (question_id);
CREATE INDEX idx_ca_author   ON community_answers (author_id);

ALTER TABLE community_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ca_select_all ON community_answers
  FOR SELECT USING (true);

CREATE POLICY ca_insert_auth ON community_answers
  FOR INSERT WITH CHECK (auth.uid()::text = author_id);

CREATE POLICY ca_update_own ON community_answers
  FOR UPDATE USING (auth.uid()::text = author_id);

-- Community votes (up/down)
CREATE TABLE community_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer')),
  target_id   UUID NOT NULL,
  direction   INT NOT NULL CHECK (direction IN (-1, 1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
COMMENT ON TABLE community_votes IS 'One-vote-per-user on questions and answers';

CREATE INDEX idx_cv_target ON community_votes (target_type, target_id);

ALTER TABLE community_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY cv_select_all ON community_votes
  FOR SELECT USING (true);

CREATE POLICY cv_insert_own ON community_votes
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY cv_delete_own ON community_votes
  FOR DELETE USING (auth.uid()::text = user_id);

-- Content reports (moderation)
CREATE TABLE content_reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type TEXT NOT NULL CHECK (content_type IN ('question', 'answer', 'comment')),
  content_id   UUID NOT NULL,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id, reporter_id)
);
COMMENT ON TABLE content_reports IS 'User-submitted moderation reports';

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_insert_auth ON content_reports
  FOR INSERT WITH CHECK (auth.uid()::text = reporter_id);

-- ============================================================================
-- PART 6 — Expert verification
-- ============================================================================

-- Expert verification requests
CREATE TABLE expert_verifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cert_type    TEXT NOT NULL,
  cert_number  TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'verified', 'rejected')),
  reviewed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note  TEXT,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE expert_verifications IS 'Professional certification verification requests';

CREATE INDEX idx_ev_user   ON expert_verifications (user_id);
CREATE INDEX idx_ev_status ON expert_verifications (status);

ALTER TABLE expert_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY ev_select_own ON expert_verifications
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY ev_insert_own ON expert_verifications
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Expert profiles (public-facing)
CREATE TABLE expert_profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name   TEXT,
  certifications TEXT[] DEFAULT '{}',
  verified_at    TIMESTAMPTZ,
  specialties    TEXT[] DEFAULT '{}',
  reputation     INT NOT NULL DEFAULT 0
);
COMMENT ON TABLE expert_profiles IS 'Public expert profile with certifications and reputation score';

ALTER TABLE expert_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY ep_select_all ON expert_profiles
  FOR SELECT USING (true);

CREATE POLICY ep_update_own ON expert_profiles
  FOR UPDATE USING (auth.uid()::text = user_id);

-- ============================================================================
-- PART 7 — Timestamp proofs (IPFS / blockchain)
-- ============================================================================

CREATE TABLE timestamp_proofs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_hash TEXT UNIQUE NOT NULL,
  ipfs_cid     TEXT,
  tx_hash      TEXT,
  block_number BIGINT,
  chain        TEXT DEFAULT 'polygon',
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE timestamp_proofs IS 'Server registry timestamps for receipt hashes and optional IPFS CIDs; not legal notarization or a blockchain transaction';

CREATE INDEX idx_tp_hash ON timestamp_proofs (receipt_hash);
CREATE INDEX idx_tp_cid  ON timestamp_proofs (ipfs_cid) WHERE ipfs_cid IS NOT NULL;

ALTER TABLE timestamp_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tp_select_all ON timestamp_proofs
  FOR SELECT USING (true);

-- ============================================================================
-- PART 8 — Notifications
-- ============================================================================

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE notifications IS 'In-app notification feed';

CREATE INDEX idx_notif_user    ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notif_unread  ON notifications (user_id) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select_own ON notifications
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY notif_update_own ON notifications
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Notification preferences
CREATE TABLE notification_preferences (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  standard_updates BOOLEAN NOT NULL DEFAULT true,
  keyword_news     BOOLEAN NOT NULL DEFAULT true,
  cert_alerts      BOOLEAN NOT NULL DEFAULT true,
  calc_complete    BOOLEAN NOT NULL DEFAULT true,
  community_answers BOOLEAN NOT NULL DEFAULT true,
  email            BOOLEAN NOT NULL DEFAULT false,
  push             BOOLEAN NOT NULL DEFAULT false
);
COMMENT ON TABLE notification_preferences IS 'Per-user notification channel and topic preferences';

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY np_select_own ON notification_preferences
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY np_upsert_own ON notification_preferences
  FOR ALL USING (auth.uid()::text = user_id);

-- Anonymous product feedback. Writes are performed only by the server service role.
CREATE TABLE feedback (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL CHECK (type IN ('calculation', 'search')),
  target_id  TEXT NOT NULL,
  rating     TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  comment    TEXT,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_target ON feedback (type, target_id, created_at DESC);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Contact inquiries contain PII and are accessible only through the server service role.
CREATE TABLE contact_messages (
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
CREATE INDEX idx_contact_messages_status ON contact_messages (status, created_at DESC);
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Field safety events are append-only records written by authenticated API routes.
CREATE TABLE field_safety_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('sos', 'completed')),
  work_site     TEXT NOT NULL,
  worker_count  INT,
  occurred_at   TIMESTAMPTZ NOT NULL,
  receipt_hash  TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_field_events_user ON field_safety_events (user_id, created_at DESC);
CREATE INDEX idx_field_events_session ON field_safety_events (session_id, created_at DESC);
ALTER TABLE field_safety_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 9 — Audit log (enterprise)
-- ============================================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   TEXT NOT NULL,
  user_id     TEXT,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  details     JSONB DEFAULT '{}',
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE audit_log IS 'Append-only audit trail for enterprise tenants';

CREATE INDEX idx_audit_tenant  ON audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_audit_user    ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit_log (action);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Audit logs readable by tenant admins only (handled via service role or custom claim)
CREATE POLICY audit_select_service ON audit_log
  FOR SELECT USING (false);  -- default deny; service role bypasses RLS

CREATE POLICY audit_insert_service ON audit_log
  FOR INSERT WITH CHECK (true);  -- allow inserts from authenticated sessions

-- ============================================================================
-- PART 10 — Enterprise tenants
-- ============================================================================

CREATE TABLE enterprise_tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  domain      TEXT UNIQUE,
  sso_config  JSONB DEFAULT '{}',
  custom_llm  TEXT,
  max_users   INT NOT NULL DEFAULT 50,
  features    TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE enterprise_tenants IS 'Multi-tenant enterprise configuration with SSO and feature flags';

ALTER TABLE enterprise_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY et_select_service ON enterprise_tenants
  FOR SELECT USING (false);  -- service role only

-- ============================================================================
-- PART 11 — Crawl jobs (standards ingestion)
-- ============================================================================

CREATE TABLE crawl_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source          TEXT NOT NULL,
  last_run_at     TIMESTAMPTZ,
  documents_count INT NOT NULL DEFAULT 0,
  errors          TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE crawl_jobs IS 'Standards document crawl/ingestion job tracking';

ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY cj_select_service ON crawl_jobs
  FOR SELECT USING (false);  -- service role only

-- ============================================================================
-- PART 12 — Add foreign key back-reference for project_id in receipts
-- ============================================================================

ALTER TABLE calculation_receipts
  ADD CONSTRAINT fk_receipts_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 13 — RPC functions
-- ============================================================================

-- Increment answer_count on a question when a new answer is inserted
CREATE OR REPLACE FUNCTION increment_answer_count(question_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE community_questions
  SET answer_count = answer_count + 1
  WHERE id = question_uuid;
END;
$$;

COMMENT ON FUNCTION increment_answer_count IS 'Atomically increment answer_count on a community question';

-- Signed Stripe webhooks are applied exactly once and ordered by event time.
CREATE TABLE stripe_webhook_events (
  id          TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL,
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
  IF p_tier NOT IN ('free', 'pro', 'team') THEN
    RAISE EXCEPTION 'invalid subscription tier';
  END IF;
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

  IF previous_event_time IS NOT NULL AND previous_event_time > p_event_created_at THEN
    RETURN 'stale';
  END IF;

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

-- Apply vote toggles and counter updates in one transaction. API routes call this
-- with the service role only; direct public execution is revoked below.
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
    SELECT votes INTO current_votes
    FROM community_questions
    WHERE id = p_target_id AND hidden = false
    FOR UPDATE;
  ELSE
    SELECT votes INTO current_votes
    FROM community_answers
    WHERE id = p_target_id AND hidden = false
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vote target not found';
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
-- PART 14 — Trigger: auto-increment answer_count on insert
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_increment_answer_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM increment_answer_count(NEW.question_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_answer_insert
  AFTER INSERT ON community_answers
  FOR EACH ROW
  EXECUTE FUNCTION trg_increment_answer_count();
