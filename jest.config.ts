import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // `scripts` 도 훑는다 — 리포 기반 방어(pre-commit 훅 등)는 `src` 밖에 살지만
  // **그것도 발화 검증이 필요하다.** 등록만 하고 안 도는 방어는 이 리포에서
  // 반복해서 났다(§2.2). 현재 `scripts/__tests__` 에 훅 실발화 검사 1개.
  roots: ['<rootDir>/src', '<rootDir>/scripts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@search/(.*)$': '<rootDir>/src/search/$1',
    '^@agent/(.*)$': '<rootDir>/src/agent/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  // 래칫 바닥. 2026-07-25 실측값(stmts 75.07 · branch 63.80 · func 73.25 ·
  // lines 77.78)에서 잡음 여유만 뺀 값이다. 목표치가 아니라 **후퇴 금지선**이라
  // 임의로 높이 걸지 않는다 — 못 지킬 수치를 걸면 게이트를 끄게 되고, 그러면
  // 아무것도 지켜지지 않는다. 커버리지가 오르면 이 바닥도 같이 올린다.
  coverageThreshold: {
    global: { statements: 75, branches: 63, functions: 73, lines: 77 },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};

export default config;
