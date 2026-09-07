import { execFileSync } from 'node:child_process';
import path from 'node:path';

it('passes commercial drawing geometry, resume and export contracts on production modules', () => {
  const root = path.resolve(__dirname, '../../../..');
  const output = execFileSync(process.execPath, [
    '--test', '--test-reporter=tap', path.join(root, 'scripts/lib/drawing-commercial.node-test.mjs'),
  ], { cwd: root, encoding: 'utf8', timeout: 25_000 });
  expect(output).toContain('# fail 0');
}, 30_000);
