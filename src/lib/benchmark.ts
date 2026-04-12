/**
 * Calculator Performance Benchmark
 *
 * High-resolution timing of all 56 ESVA calculators.
 * Uses performance.now() for sub-millisecond accuracy.
 *
 * PART 1: Types
 * PART 2: Single calculator benchmark
 * PART 3: Benchmark all calculators
 * PART 4: Markdown report formatter
 */

import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import type { CalculatorRegistryEntry } from '@/engine/calculators';

// ---------------------------------------------------------------------------
// PART 1 — Types
// ---------------------------------------------------------------------------

export interface BenchmarkResult {
  calcId: string;
  iterations: number;
  p50ms: number;
  p95ms: number;
  p99ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  medianMs: number;
  opsPerSec: number;
}

// ---------------------------------------------------------------------------
// PART 2 — Single Calculator Benchmark
// ---------------------------------------------------------------------------

const WARMUP_ITERATIONS = 5;
const DEFAULT_ITERATIONS = 100;

/**
 * Minimal dummy inputs per category.
 * 각 계산기 타입별 최소 유효 입력값
 */
function getDummyInput(entry: CalculatorRegistryEntry): Record<string, unknown> {
  switch (entry.category) {
    case 'power':
      return { voltage: 380, current: 100, powerFactor: 0.85, phase: 3 };
    case 'voltage-drop':
      return {
        voltage: 380, current: 50, length: 100, cableSize: 35,
        powerFactor: 0.85, phase: 3, conductor: 'Cu', reactance: 0.08,
      };
    case 'cable':
      return { current: 100, voltage: 380, installMethod: 'tray', conductor: 'Cu', insulation: 'XLPE' };
    case 'transformer':
      return {
        totalLoad: 500, demandFactor: 0.7, powerFactor: 0.85,
        growthPercent: 20, ratedCapacity: 1000, loadRatio: 0.75,
        noLoadLoss: 1.2, loadLoss: 8.5, impedancePercent: 5,
      };
    case 'protection':
      return {
        voltage: 380, loadCurrent: 100, transformerKVA: 1000,
        secondaryVoltage: 380, impedancePercent: 5, phase: 3,
      };
    case 'grounding':
      return { soilResistivity: 100, rodLength: 2.4, rodDiameter: 14, rodCount: 1 };
    case 'motor':
      return {
        motorPower: 75, voltage: 380, efficiency: 0.93,
        powerFactor: 0.87, startingMultiple: 6, ratedCurrent: 130,
      };
    case 'renewable':
      return {
        capacity: 100, peakSunHours: 3.5, systemLoss: 0.15,
        dailyGeneration: 350, daysOfAutonomy: 1, dod: 0.8,
      };
    case 'substation':
      return {
        totalLoad: 2000, demandFactor: 0.7, powerFactor: 0.85,
        voltage: 22900, primaryVoltage: 22900, secondaryVoltage: 380,
        loadCurrent: 100,
      };
    case 'lighting':
      return {
        area: 100, requiredLux: 500, luminousFlux: 3000,
        maintenanceFactor: 0.7, utilizationFactor: 0.5,
        totalLoad: 200, operatingHours: 8760,
      };
    case 'global':
      return { ambientTemp: 40, baseTemp: 30, current: 100, frequency: 60 };
    case 'ai':
      return { inputTokens: 1000, outputTokens: 500, model: 'gpt-4.1-mini' };
    default:
      return { voltage: 380, current: 100 };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Benchmark a single calculator with high-resolution timing.
 */
export function benchmarkCalculator(
  calcId: string,
  iterations: number = DEFAULT_ITERATIONS,
): BenchmarkResult {
  const entry = CALCULATOR_REGISTRY.get(calcId);
  if (!entry) {
    return {
      calcId,
      iterations: 0,
      p50ms: 0, p95ms: 0, p99ms: 0,
      minMs: 0, maxMs: 0, avgMs: 0, medianMs: 0, opsPerSec: 0,
    };
  }

  const input = getDummyInput(entry);

  // 워밍업 — JIT 최적화 안정화
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    try { entry.calculator(input); } catch { /* skip */ }
  }

  // 측정
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      entry.calculator(input);
    } catch {
      // 에러 발생 시에도 타이밍 기록
    }
    durations.push(performance.now() - start);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avgMs = sum / sorted.length;

  return {
    calcId,
    iterations,
    p50ms: round3(percentile(sorted, 50)),
    p95ms: round3(percentile(sorted, 95)),
    p99ms: round3(percentile(sorted, 99)),
    minMs: round3(sorted[0]),
    maxMs: round3(sorted[sorted.length - 1]),
    avgMs: round3(avgMs),
    medianMs: round3(percentile(sorted, 50)),
    opsPerSec: avgMs > 0 ? Math.round(1000 / avgMs) : 0,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// PART 3 — Benchmark All Calculators
// ---------------------------------------------------------------------------

/**
 * Run benchmarks on all 56 calculators.
 */
export function benchmarkAll(
  iterations: number = DEFAULT_ITERATIONS,
): Map<string, BenchmarkResult> {
  const results = new Map<string, BenchmarkResult>();

  for (const [calcId] of CALCULATOR_REGISTRY) {
    results.set(calcId, benchmarkCalculator(calcId, iterations));
  }

  return results;
}

// ---------------------------------------------------------------------------
// PART 4 — Markdown Report Formatter
// ---------------------------------------------------------------------------

/**
 * Format benchmark results as a markdown table.
 */
export function formatBenchmarkReport(results: Map<string, BenchmarkResult>): string {
  const lines: string[] = [
    '# ESVA Calculator Benchmark Report',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    '| Calculator | Iterations | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) | ops/sec |',
    '|:-----------|:----------:|:--------:|:--------:|:--------:|:--------:|:--------:|:--------:|:-------:|',
  ];

  const sorted = Array.from(results.values()).sort((a, b) => a.avgMs - b.avgMs);

  for (const r of sorted) {
    lines.push(
      `| ${r.calcId} | ${r.iterations} | ${r.avgMs} | ${r.p50ms} | ${r.p95ms} | ${r.p99ms} | ${r.minMs} | ${r.maxMs} | ${r.opsPerSec} |`,
    );
  }

  // Summary
  const allAvg = sorted.map((r) => r.avgMs);
  const totalAvg = allAvg.reduce((a, b) => a + b, 0) / allAvg.length;
  const slowest = sorted[sorted.length - 1];
  const fastest = sorted[0];

  lines.push('');
  lines.push('## Summary');
  lines.push(`- Total calculators: ${results.size}`);
  lines.push(`- Overall avg: ${round3(totalAvg)}ms`);
  lines.push(`- Fastest: ${fastest?.calcId} (${fastest?.avgMs}ms)`);
  lines.push(`- Slowest: ${slowest?.calcId} (${slowest?.avgMs}ms)`);

  return lines.join('\n');
}
