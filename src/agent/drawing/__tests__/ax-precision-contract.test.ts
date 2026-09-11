import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Run the same production-module contract in the normal Jest/CI lane, not only
// when someone remembers to invoke the optional script test suite.
it('passes the AX precision production-module regressions without external AI', () => {
  const root = path.resolve(__dirname, '../../../..');
  const output = execFileSync(process.execPath, [
    '--test', '--test-reporter=tap', path.join(root, 'scripts/lib/ax-precision.node-test.mjs'),
  ], { cwd: root, encoding: 'utf8', timeout: 25_000 });
  expect(output).toContain('# fail 0');
}, 30_000);
