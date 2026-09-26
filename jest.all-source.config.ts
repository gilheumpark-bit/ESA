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
  // This inventory's initial measurement establishes its own ratchet. The
  // original config continues enforcing the existing 75/63/73/77 thresholds.
  coverageThreshold: undefined,
};
export default config;
