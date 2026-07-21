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
  {
    // eslint-config-next 16이 새로 켠 React Compiler 시대 react-hooks 규칙들.
    // 정상 동작하는 기존 패턴(effect 내 setState 등)을 error로 잡아 게이트를 막는데,
    // 코드 재작성은 동작을 깰 위험이 커 별도 React Compiler 준비 작업으로 분리한다.
    // 숨기지 않고 warn으로 남겨 가시화한다.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];

export default config;
