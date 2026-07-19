// ESLint flat config (eslint 9/10). Next 16에서 `next lint`가 제거되어
// `eslint .`로 직접 실행한다. eslint-config-next는 flat config 배열을 export.
import next from 'eslint-config-next';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'e2e/**',
      'public/**',
      '**/*.d.ts',
    ],
  },
  ...next,
];
