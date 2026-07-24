// Jest 설정은 ESM(.mjs)으로 둔다.
// `jest.config.ts`는 Jest가 설정 파일을 파싱할 때 `ts-node`를 요구하는데,
// ts-node는 이 저장소의 의존성(package.json/package-lock.json)이 아니다.
// 그 상태에서는 clean install 후 `npm test`가 설정 파싱 단계에서 즉시 실패한다.
// 테스트 코드 자체의 TypeScript 변환은 그대로 ts-jest가 담당한다.

/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@search/(.*)$': '<rootDir>/src/search/$1',
    '^@agent/(.*)$': '<rootDir>/src/agent/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};

export default config;
