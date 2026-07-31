import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jestBin = require.resolve('jest/bin/jest');
const result = spawnSync(
  process.execPath,
  [
    jestBin,
    '--runInBand',
    'src/lib/__tests__/chatgpt-local-live.test.ts',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CHATGPT_LOCAL_LIVE: '1',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
