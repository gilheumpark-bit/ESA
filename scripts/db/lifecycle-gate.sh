#!/usr/bin/env bash
set -euo pipefail
# Destructive fixture setup: refuse every non-loopback database target.
: "${ESA_TEST_DATABASE_URL:?Isolated PostgreSQL URL required}"
case "$ESA_TEST_DATABASE_URL" in postgres*://*@127.0.0.1:*/*|postgres*://*@localhost:*/*) ;; *) echo 'Only an isolated loopback test database is allowed' >&2; exit 1;; esac
psql "$ESA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULL::UUID $$;
CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT 'service_role'::TEXT $$;
SQL
for migration in supabase/migrations/*.sql; do
  echo "Applying fixture migration: $migration"
  psql "$ESA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
psql "$ESA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/lifecycle-test.sql
# Exercise the real row lock from eight different PostgreSQL sessions.
export ESA_TEST_DATABASE_URL
seq 1 8 | xargs -P8 -I{} bash -c 'psql "$ESA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT (public.create_project_atomic('\''concurrent'\'','\''concurrent-owner'\'',NULL,'\''00000000-0000-4000-8000-000000000099'\'')).id"' > /tmp/esa-db-concurrent.txt
test "$(sort -u /tmp/esa-db-concurrent.txt | wc -l)" = 1
echo 'PASS: eight real database sessions created one project identity'
