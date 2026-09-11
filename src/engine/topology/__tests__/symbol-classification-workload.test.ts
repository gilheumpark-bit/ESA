import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { classificationDxf, parsedClassification } from '../test-support/symbol-classification-fixture';
import { parseDxfToSLD } from '../dxf-parser';

it('records bounded geometry reuse on a known synthetic symbol family, not an independent accuracy sample', () => {
  const results: Array<Record<string, unknown>> = [];
  for (const count of [1, 8, 32]) {
    const start = performance.now(), withLibrary = parsedClassification(count), elapsedMs = performance.now() - start;
    const withoutLibrary = parseDxfToSLD(classificationDxf(count));
    const variants = withLibrary.components.filter((c) => c.properties?.blockName === 'ZZ-B92');
    expect(variants).toHaveLength(count);
    expect(variants.every((c) => c.classification?.selectedType === 'breaker')).toBe(true);
    expect(variants.every((c) => c.type === 'unknown' && c.rating === undefined && c.current === undefined)).toBe(true);
    expect(withoutLibrary.classificationStats?.inferred).toBe(0);
    expect(withLibrary.classificationStats).toMatchObject({ inferred: count, shapeComparisons: 1, reusedShapeComparisons: count - 1, additionalModelCalls: 0 });
    results.push({ variantInstances: count, originalTypeUnknown: variants.filter((c) => c.type === 'unknown').length,
      classifiedWithContext: withLibrary.classificationStats?.inferred, classifiedWithoutLibrary: withoutLibrary.classificationStats?.inferred,
      stats: withLibrary.classificationStats, parseAndClassificationMs: Math.round(elapsedMs * 1000) / 1000 });
  }
  const report = { source: 'production DXF parser on a declared synthetic family',
    scope: 'Three workload sizes of the SAME family, not independent drawings. Timings include parsing and are not a service latency SLA.', results };
  if (process.env.SYMBOL_BENCH_OUTPUT) {
    mkdirSync(dirname(process.env.SYMBOL_BENCH_OUTPUT), { recursive: true });
    writeFileSync(process.env.SYMBOL_BENCH_OUTPUT, JSON.stringify(report, null, 2));
  }
  console.log('SYMBOL_CLASSIFICATION_WORKLOAD', JSON.stringify(report));
});
