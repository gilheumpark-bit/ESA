/**
 * Jest config in CommonJS (.js) so Jest can parse it without `ts-node`.
 * `ts-jest` still transforms the `.test.ts(x)` sources via the `transform` map.
 * @type {import('jest').Config}
 */
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

module.exports = config;
