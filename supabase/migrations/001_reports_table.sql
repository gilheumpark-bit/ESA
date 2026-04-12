-- ESVA Reports Table
-- 검증 보고서 영구 저장. /report/[id] 페이지에서 조회.

CREATE TABLE IF NOT EXISTS esva_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     TEXT UNIQUE NOT NULL,       -- "RPT-XXXXXXXXX"
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 프로젝트 정보
  project_name  TEXT NOT NULL DEFAULT '미지정 프로젝트',
  project_type  TEXT NOT NULL DEFAULT '전기 설비',

  -- 판정 결과
  verdict       TEXT NOT NULL CHECK (verdict IN ('PASS', 'CONDITIONAL', 'FAIL')),
  grade         TEXT NOT NULL CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C', 'D', 'F')),
  composite_score INTEGER NOT NULL CHECK (composite_score BETWEEN 0 AND 100),

  -- 전체 보고서 JSON
  report_json   JSONB NOT NULL,

  -- 메타데이터
  hash          TEXT,                        -- SHA-256 of report_json
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reports_user ON esva_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON esva_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_verdict ON esva_reports(verdict);
CREATE INDEX IF NOT EXISTS idx_reports_grade ON esva_reports(grade);

-- RLS (Row Level Security)
ALTER TABLE esva_reports ENABLE ROW LEVEL SECURITY;

-- 정책: 본인 보고서만 조회/생성 가능
CREATE POLICY "Users can view own reports"
  ON esva_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON esva_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 서비스 롤은 모든 접근 가능
CREATE POLICY "Service role full access"
  ON esva_reports FOR ALL
  USING (auth.role() = 'service_role');

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reports_updated_at
  BEFORE UPDATE ON esva_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
