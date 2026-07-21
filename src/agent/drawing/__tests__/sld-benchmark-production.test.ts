import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { GoldenLabel } from '../sld-evaluator-v2';
import { runBenchmarkSuite } from '../sld-benchmark-runner';

interface LegacyFixtureLabel {
  id: string;
  expected: {
    nodes: Array<{ name: string; type: string; x: number; y: number }>;
    edges: Array<{ from: string; to: string }>;
  };
}

function exactArrayBuffer(body: Buffer): ArrayBuffer {
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
}

describe('SLD benchmark production entrypoint', () => {
  it('runs a checked-in DXF through the production analyzer, evaluator, and artifact writer', async () => {
    const fixtureRoot = resolve(process.cwd(), 'fixtures/drawings/synthetic');
    const fixture = JSON.parse(readFileSync(join(fixtureRoot, 'L1-01-basic-radial.label.json'), 'utf8')) as LegacyFixtureLabel;
    const dxf = readFileSync(join(fixtureRoot, 'L1-01-basic-radial.dxf'));
    const label: GoldenLabel = {
      labelId: `${fixture.id}-v3-production-smoke`,
      stratum: 'synthetic-clean-dxf',
      symbols: fixture.expected.nodes.map((node) => ({
        type: node.type,
        label: node.name,
        bounds: { x: node.x - 2, y: node.y - 2, w: 4, h: 4 },
        pageIndex: 0,
      })),
      edges: fixture.expected.edges.map((edge) => ({
        fromLabel: edge.from,
        toLabel: edge.to,
        pageIndex: 0,
      })),
      texts: [],
    };
    const outDir = mkdtempSync(join(tmpdir(), 'esa-sld-benchmark-'));

    try {
      const result = await runBenchmarkSuite([{
        id: fixture.id,
        bytes: exactArrayBuffer(dxf),
        mimeType: 'application/dxf',
        fileName: 'L1-01-basic-radial.dxf',
        label,
      }], {
        provider: 'deterministic',
        model: 'esa-dxf-parser',
        datasetKind: 'synthetic',
        runsPerCase: 1,
        outDir,
      });

      expect(result.cases).toHaveLength(1);
      expect(result.suite.receipt).toMatchObject({
        provider: 'deterministic',
        model: 'esa-dxf-parser',
        datasetKind: 'synthetic',
        runCount: 1,
      });
      const prediction = JSON.parse(readFileSync(join(outDir, `${fixture.id}.run-1.prediction.json`), 'utf8'));
      expect(prediction).toMatchObject({ schemaVersion: 3, pageCount: 1 });
      expect(prediction.evidenceGraph.symbols.length).toBeGreaterThan(0);
      expect(readFileSync(join(outDir, 'suite.receipt.json'), 'utf8')).toContain('esa-dxf-parser');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
