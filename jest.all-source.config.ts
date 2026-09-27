import type { Config } from 'jest';
import base from './jest.config.ts';

/** Separate full-source denominator; do not weaken the established unit gate. */
const config: Config = {
  ...base,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.{test,spec}.{ts,tsx}',
  ],
  coverageDirectory: 'coverage-all-source',
  coverageReporters: ['json', 'json-summary', 'text'],
  // Full-source baseline: CI 36261611236 (6b2df279), 583 production files.
  // Jest subtracts the explicit critical-file groups from the global group.
  // These floors use that remainder; the original 75/63/73/77 unit gate remains.
  coverageThreshold: {
    global: { statements: 59.4, branches: 53.8, functions: 54.5, lines: 60.8 },
    './src/engine/llm/output-filter.ts': { statements: 95, branches: 87, functions: 90, lines: 95 },
    './src/engine/llm/app-asserted-constants.ts': { statements: 97, branches: 90, functions: 100, lines: 100 },
    './src/lib/firebase-id-token.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
export default config;
