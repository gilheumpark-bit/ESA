import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryResidue } from './repository-hygiene.mjs';

const forbidden = ['.audit/apply.py', '.performance-lab/patch.b64', '.remaining-support/fix.py', '.review-patches/0.b64', '.cleanup/script.py', '.tmp-sld-live/file.json', 'test-results/private.json', 'playwright-report/index.html', '.next/cache/data', '.env', '.env.local', 'nested/.env.production', 'src/file.ts.orig', 'types.tsbuildinfo', 'src/file.ts~'];
for (const file of forbidden) test(`rejects tracked residue ${file}`, () => assert.equal(repositoryResidue([file]).length, 1));
test('preserves maintained tooling, example config, original fixtures and historical manuals', () => {
  assert.deepEqual(repositoryResidue(['.env.example', 'nested/.env.test.example', '.claude/launch.json', '.ui-craft/brief.md',
    'scripts/audit-frontend.mjs', 'fixtures/drawings/sample.pdf', 'output/manual/manual.docx', 'docs/project/handoffs/history.md', 'src/lib/environment.ts']), []);
});
test('handles Windows separators, unusual filenames and duplicates deterministically', () => {
  assert.deepEqual(repositoryResidue(['.audit\\a.py', '.audit/a\nb.py', '.audit\\a.py']).map((r) => r.path), ['.audit/a\nb.py', '.audit\\a.py']);
});
test('actual Git inventory excludes untracked output but fails if it is staged', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'esa-hygiene-'));
  const script = fileURLToPath(new URL('../check-repository-hygiene.mjs', import.meta.url));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(path.join(root, 'README.md'), '# Fixture');
    mkdirSync(path.join(root, 'test-results'));
    const generated = path.join(root, 'test-results', 'output.json');
    writeFileSync(generated, '{}');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    const check = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(check().status, 0);
    execFileSync('git', ['add', 'test-results/output.json'], { cwd: root });
    assert.equal(check().status, 1);
    assert.equal(existsSync(generated), true, 'guard must not delete local data');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('cannot claim a clean repository when Git inventory fails', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'esa-no-git-'));
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../check-repository-hygiene.mjs', import.meta.url))], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
