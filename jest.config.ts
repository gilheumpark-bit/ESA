import type { Config } from 'jest';

const config: Config = {
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
