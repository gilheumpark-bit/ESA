import { readFileSync } from 'fs';
import { join } from 'path';

describe('Supabase schema contract', () => {
  const initial = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql'),
    'utf8',
  );
  const reports = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '001_reports_table.sql'),
    'utf8',
  );
  const upgrade = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '002_firebase_contract.sql'),
    'utf8',
  );

  test('uses Firebase string IDs throughout server-mediated ownership columns', () => {
    expect(initial).toMatch(/CREATE TABLE users \([\s\S]*?id\s+TEXT PRIMARY KEY/);
    expect(initial).toMatch(/user_id\s+TEXT REFERENCES users\(id\)/);
    expect(reports).toMatch(/user_id\s+TEXT NOT NULL/);
  });

  test('matches the receipt column names used by every API reader and writer', () => {
    expect(initial).toMatch(/calculator_id\s+TEXT/);
    expect(initial).toMatch(/calculator_name\s+TEXT/);
    expect(initial).toMatch(/outputs\s+JSONB/);
    expect(initial).toMatch(/metadata\s+JSONB/);
    expect(initial).not.toMatch(/\bcalc_id\s+TEXT/);
  });

  test('creates project_members before any policy references it', () => {
    const tableIndex = initial.indexOf('CREATE TABLE project_members');
    const policyIndex = initial.indexOf('CREATE POLICY projects_select');

    expect(tableIndex).toBeGreaterThan(-1);
    expect(policyIndex).toBeGreaterThan(tableIndex);
  });

  test('keeps billing entitlement server-owned and webhook updates idempotent', () => {
    for (const migration of [initial, upgrade]) {
      expect(migration).toMatch(/stripe_webhook_events/);
      expect(migration).toMatch(/apply_stripe_subscription_event/);
      expect(migration).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
      expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION apply_stripe_subscription_event[\s\S]*?TO service_role/);
      expect(migration).not.toMatch(/CREATE POLICY users_update_own/);
    }
  });
});
