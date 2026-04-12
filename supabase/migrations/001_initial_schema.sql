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
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT UNIQUE NOT NULL,
  nickname    TEXT,
  tier        TEXT NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free', 'pro', 'enterprise')),
  country_code TEXT DEFAULT 'KR',
  language_pref TEXT DEFAULT 'ko',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Core user accounts synced from Firebase Auth';

CREATE INDEX idx_users_email ON users (email);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================================
-- PART 2 — Calculation receipts
-- ============================================================================

-- Calculation receipts: immutable record of every calculation
CREATE TABLE calculation_receipts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calc_id           TEXT,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id        UUID,
  country_code      TEXT DEFAULT 'KR',
  applied_standard  TEXT,
  unit_system       TEXT DEFAULT 'metric'
                      CHECK (unit_system IN ('metric', 'imperial')),
  difficulty_level  TEXT DEFAULT 'basic'
                      CHECK (difficulty_level IN ('basic', 'intermediate', 'advanced')),
  inputs            JSONB NOT NULL DEFAULT '{}',
  result            JSONB NOT NULL DEFAULT '{}',
  steps             JSONB DEFAULT '[]',
  formula_used      TEXT,
  standards_used    TEXT[] DEFAULT '{}',
  warnings          TEXT[] DEFAULT '{}',
  recommendations   TEXT[] DEFAULT '{}',
  disclaimer_text   TEXT,
  disclaimer_version TEXT,
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  standard_version  TEXT,
  engine_version    TEXT,
  is_standard_current BOOLEAN DEFAULT true,
  receipt_hash      TEXT UNIQUE,
  share_token       TEXT UNIQUE,
  is_public         BOOLEAN DEFAULT false,
  ipfs_cid          TEXT,
  blockchain_tx     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE calculation_receipts IS 'Immutable calculation receipts with provenance and optional IPFS pinning';

CREATE INDEX idx_receipts_user_id    ON calculation_receipts (user_id);
CREATE INDEX idx_receipts_created_at ON calculation_receipts (created_at DESC);
CREATE INDEX idx_receipts_hash       ON calculation_receipts (receipt_hash);
CREATE INDEX idx_receipts_share      ON calculation_receipts (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_receipts_project    ON calculation_receipts (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_receipts_calc_id    ON calculation_receipts (calc_id);

-- RLS
ALTER TABLE calculation_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_select_own ON calculation_receipts
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_public = true
  );

CREATE POLICY receipts_insert_own ON calculation_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY receipts_delete_own ON calculation_receipts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3 — Projects and membership
-- ============================================================================

-- Projects: group calculations into named projects
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived', 'deleted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE projects IS 'User projects that group related calculations';

CREATE INDEX idx_projects_owner ON projects (owner_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON projects
  FOR SELECT USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY projects_insert_own ON projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY projects_update_own ON projects
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY projects_delete_own ON projects
  FOR DELETE USING (auth.uid() = owner_id);

-- Project members: collaboration on shared projects
CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('viewer', 'editor', 'admin')),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at   TIMESTAMPTZ,
  UNIQUE (project_id, user_id)
);
COMMENT ON TABLE project_members IS 'Project collaboration membership';

CREATE INDEX idx_pm_project ON project_members (project_id);
CREATE INDEX idx_pm_user    ON project_members (user_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select ON project_members
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY pm_insert_owner ON project_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY pm_delete_owner ON project_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()
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
        AND (p.owner_id = auth.uid()
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()))
    )
  );

CREATE POLICY pc_insert ON project_calculations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()
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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE share_links IS 'Temporary share links for projects with optional password and expiry';

CREATE INDEX idx_share_token ON share_links (token);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY share_select ON share_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );

CREATE POLICY share_insert ON share_links
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );

CREATE POLICY share_delete ON share_links
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );

-- ============================================================================
-- PART 5 — Community Q&A
-- ============================================================================

-- Community questions
CREATE TABLE community_questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  tags           TEXT[] DEFAULT '{}',
  author_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  standard_refs  TEXT[] DEFAULT '{}',
  calc_refs      TEXT[] DEFAULT '{}',
  votes          INT NOT NULL DEFAULT 0,
  answer_count   INT NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'closed', 'resolved')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
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
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY cq_update_own ON community_questions
  FOR UPDATE USING (auth.uid() = author_id);

-- Community answers
CREATE TABLE community_answers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id    UUID NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  author_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_expert      BOOLEAN NOT NULL DEFAULT false,
  standard_refs  TEXT[] DEFAULT '{}',
  votes          INT NOT NULL DEFAULT 0,
  is_accepted    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE community_answers IS 'Answers to community questions, with expert badge support';

CREATE INDEX idx_ca_question ON community_answers (question_id);
CREATE INDEX idx_ca_author   ON community_answers (author_id);

ALTER TABLE community_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ca_select_all ON community_answers
  FOR SELECT USING (true);

CREATE POLICY ca_insert_auth ON community_answers
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY ca_update_own ON community_answers
  FOR UPDATE USING (auth.uid() = author_id);

-- Community votes (up/down)
CREATE TABLE community_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY cv_delete_own ON community_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Content reports (moderation)
CREATE TABLE content_reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type TEXT NOT NULL CHECK (content_type IN ('question', 'answer', 'comment')),
  content_id   UUID NOT NULL,
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE content_reports IS 'User-submitted moderation reports';

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_insert_auth ON content_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ============================================================================
-- PART 6 — Expert verification
-- ============================================================================

-- Expert verification requests
CREATE TABLE expert_verifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cert_type    TEXT NOT NULL,
  cert_number  TEXT,
  evidence_url TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE expert_verifications IS 'Professional certification verification requests';

CREATE INDEX idx_ev_user   ON expert_verifications (user_id);
CREATE INDEX idx_ev_status ON expert_verifications (status);

ALTER TABLE expert_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY ev_select_own ON expert_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY ev_insert_own ON expert_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Expert profiles (public-facing)
CREATE TABLE expert_profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
  FOR UPDATE USING (auth.uid() = user_id);

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
COMMENT ON TABLE timestamp_proofs IS 'Blockchain/IPFS anchoring proofs for calculation receipts';

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
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE notifications IS 'In-app notification feed';

CREATE INDEX idx_notif_user    ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notif_unread  ON notifications (user_id) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select_own ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notif_update_own ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Notification preferences
CREATE TABLE notification_preferences (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  standard_updates BOOLEAN NOT NULL DEFAULT true,
  keyword_news     BOOLEAN NOT NULL DEFAULT true,
  cert_alerts      BOOLEAN NOT NULL DEFAULT true,
  email            BOOLEAN NOT NULL DEFAULT true,
  push             BOOLEAN NOT NULL DEFAULT false
);
COMMENT ON TABLE notification_preferences IS 'Per-user notification channel and topic preferences';

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY np_select_own ON notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY np_upsert_own ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- PART 9 — Audit log (enterprise)
-- ============================================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
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
