/**
 * 로컬 Claude CLI 실호출 게이트.
 *
 * 로그인된 `claude` CLI가 있는 기계에서만 의미가 있고, 실행하면 사용자
 * 계정의 사용량을 쓴다. 그래서 전체 게이트(`scripts/enforce.ps1`)에는 넣지
 * 않고 명시적으로만 돌린다.
 *
 *   npm run gate:claude-local-live
 */
import { spawn } from 'node:child_process';

const args = [
  'jest',
  '--runInBand',
  'src/lib/__tests__/claude-local-live.test.ts',
  ...process.argv.slice(2),
];

const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', 'npx', ...args], {
    stdio: 'inherit',
    env: { ...process.env, ESA_CLAUDE_LOCAL_LIVE: '1' },
    windowsHide: true,
  })
  : spawn('npx', args, {
    stdio: 'inherit',
    env: { ...process.env, ESA_CLAUDE_LOCAL_LIVE: '1' },
  });

child.on('close', (code) => {
  process.exitCode = code ?? 1;
});
