import { readFileSync } from 'fs';
import { join } from 'path';

const read = (path: string) => readFileSync(join(process.cwd(), ...path.split('/')), 'utf8');

describe('field safety persistence contract', () => {
  const sos = read('src/app/api/field/sos/route.ts');
  const complete = read('src/app/api/field/complete/route.ts');
  const page = read('src/app/(with-nav)/field/page.tsx');
  const schema = read('supabase/migrations/001_initial_schema.sql');

  test('SOS and completion require verified Firebase users and persist events', () => {
    for (const route of [sos, complete]) {
      expect(route).toContain('extractVerifiedUser');
      expect(route).toContain(".from('field_safety_events')");
      expect(route).toContain('ensureUserProfile');
    }
    expect(schema).toMatch(/CREATE TABLE field_safety_events/);
  });

  test('SOS never targets a fake account and only uses configured recipients', () => {
    expect(sos).not.toContain("userId: 'system-sos'");
    expect(sos).toContain('FIELD_SOS_RECIPIENT_UIDS');
    expect(complete).toContain('FIELD_SOS_RECIPIENT_UIDS');
    expect(complete).not.toContain('(supervisorIds ?? [])');
  });

  test('the field page authenticates both safety writes', () => {
    expect(page.match(/Authorization/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
