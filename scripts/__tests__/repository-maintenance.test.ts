import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Keep the same maintenance contracts in the standard Jest/CI lane as well.
it('runs audit-failure and tracked-residue contracts against the production scripts', () => {
  const root = path.resolve(__dirname, '../..');
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap',
    'scripts/lib/audit-policy.node-test.mjs', 'scripts/lib/repository-hygiene.node-test.mjs',
  ], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  expect(output).toContain('# fail 0');
}, 35_000);
