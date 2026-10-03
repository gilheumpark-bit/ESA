// ESLint flat config (eslint 9/10). Next 16에서 `next lint`가 제거되어
// `eslint .`로 직접 실행한다. eslint-config-next는 flat config 배열을 export.
import next from 'eslint-config-next';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'e2e/**',
      'public/**',
      '.claude/**',
      '.worktrees/**', // 격리 워크트리의 빌드 산출물·src 복사본은 이 트리의 린트 대상이 아님
      '**/*.d.ts',
    ],
  },
  ...next,
];

export default config;
