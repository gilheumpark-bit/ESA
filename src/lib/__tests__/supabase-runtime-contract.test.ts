import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split('/')), 'utf8');
}

describe('Supabase runtime and migration contract', () => {
  const initial = source('supabase/migrations/001_initial_schema.sql');
  const collaboration = source('src/lib/collaboration.ts');
  const community = source('src/lib/community.ts');
  const expert = source('src/lib/expert-verification.ts');
  const notifications = source('src/lib/notifications.ts');
  const adminRoute = source('src/app/api/admin/route.ts');
  const dashboardRoute = source('src/app/api/dashboard/route.ts');
  const exportRoute = source('src/app/api/export/route.ts');

  test('ships an upgrade migration for databases that already ran migration 001', () => {
    expect(existsSync(join(process.cwd(), 'supabase', 'migrations', '002_firebase_contract.sql'))).toBe(true);
  });

  test('collaboration code and schema use one table/column vocabulary', () => {
    expect(collaboration).toContain("const PROJECTS_TABLE = 'projects'");
    expect(collaboration).toContain("const SHARE_LINKS_TABLE = 'share_links'");
    expect(collaboration).toContain("const CALCULATIONS_TABLE = 'project_calculations'");
    expect(initial).toMatch(/CREATE TABLE project_approvals/);
    expect(initial).toMatch(/role\s+TEXT[\s\S]*?'owner'[\s\S]*?'editor'[\s\S]*?'viewer'/);
    expect(initial).toMatch(/user_id\s+TEXT REFERENCES users\(id\)/);
    expect(initial).toMatch(/email\s+TEXT/);
  });

  test('Firebase-backed server modules use the service role after route authorization', () => {
    for (const file of [collaboration, community, expert]) {
      expect(file).not.toContain('getSupabaseClient');
      expect(file).toContain('getSupabaseAdmin');
    }
    expect(notifications).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(notifications).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  test('community votes are atomic and answer counts are incremented once', () => {
    expect(initial).toMatch(/CREATE OR REPLACE FUNCTION cast_community_vote/);
    expect(community).toContain("rpc('cast_community_vote'");
    expect(community).not.toContain("rpc('increment_answer_count'");
  });

  test('moderation and expert verification columns match their runtime writers', () => {
    expect(initial).toMatch(/community_questions[\s\S]*?hidden\s+BOOLEAN/);
    expect(initial).toMatch(/community_answers[\s\S]*?hidden\s+BOOLEAN/);
    expect(initial).toMatch(/expert_verifications[\s\S]*?reviewed_by\s+TEXT/);
    expect(initial).toMatch(/expert_verifications[\s\S]*?review_note\s+TEXT/);
    expect(initial).toMatch(/status[\s\S]*?'verified'/);
    expect(initial).toMatch(/expert_profiles[\s\S]*?display_name\s+TEXT/);
    expect(initial).toMatch(/CREATE TABLE feedback/);
  });

  test('admin, dashboard, and export routes enforce the deployed ownership contract', () => {
    expect(adminRoute).not.toContain(".from('profiles')");
    expect(adminRoute).toContain(".from('users')");
    expect(dashboardRoute).toMatch(/\.from\('notifications'\)[\s\S]*?\.eq\('user_id', userId\)/);
    expect(exportRoute).not.toContain('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(exportRoute).toMatch(/\.eq\('user_id', requesterId\)/);
  });
});
