import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('community moderation RLS', () => {
  test('a later migration hides moderated questions and answers from public SELECT', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/004_community_hidden_rls.sql'),
      'utf8',
    );

    expect(migration).toMatch(/DROP POLICY IF EXISTS cq_select_all/);
    expect(migration).toMatch(
      /CREATE POLICY cq_select_visible[\s\S]*ON (?:public\.)?community_questions[\s\S]*USING \(hidden = false\)/,
    );
    expect(migration).toMatch(/DROP POLICY IF EXISTS ca_select_all/);
    expect(migration).toMatch(
      /CREATE POLICY ca_select_visible[\s\S]*ON (?:public\.)?community_answers[\s\S]*USING \(hidden = false\)/,
    );
  });
});
