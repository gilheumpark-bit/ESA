BEGIN;

CREATE TABLE IF NOT EXISTS public.share_password_attempts (
  link_hash TEXT PRIMARY KEY CHECK (link_hash ~ '^[a-f0-9]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

ALTER TABLE public.share_password_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.share_password_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.share_password_attempts TO service_role;

CREATE OR REPLACE FUNCTION consume_share_password_attempt(p_link_hash TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_attempts INTEGER;
  current_window TIMESTAMPTZ;
  window_size CONSTANT INTERVAL := interval '15 minutes';
BEGIN
  IF p_link_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT false, 900;
    RETURN;
  END IF;

  INSERT INTO public.share_password_attempts AS attempts_row (
    link_hash,
    window_started_at,
    attempts
  )
  VALUES (p_link_hash, now(), 1)
  ON CONFLICT (link_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN attempts_row.window_started_at <= now() - window_size THEN now()
      ELSE attempts_row.window_started_at
    END,
    attempts = CASE
      WHEN attempts_row.window_started_at <= now() - window_size THEN 1
      ELSE attempts_row.attempts + 1
    END
  RETURNING attempts, window_started_at
  INTO current_attempts, current_window;

  RETURN QUERY
  SELECT
    current_attempts <= 5,
    CASE
      WHEN current_attempts <= 5 THEN 0
      ELSE GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (current_window + window_size - now())))::INTEGER
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION consume_share_password_attempt(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_share_password_attempt(TEXT) TO service_role;

COMMIT;
