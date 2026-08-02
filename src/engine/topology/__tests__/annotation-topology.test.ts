import type { SLDAnalysis } from '@/lib/sld-recognition';

import { buildTopologyFromSLD } from '../topology-graph';

function fixture(): SLDAnalysis {
  return {
    components: [
      { id: 'source', type: 'source', position: { x: 10, y: 10 } },
      { id: 'breaker', type: 'breaker', position: { x: 10, y: 20 } },
      { id: 'bus', type: 'bus', position: { x: 10, y: 30 } },
      {
        id: 'flow-note',
        type: 'annotation',
        label: '▲ 75 MW; ▲ 23 MVAR',
        position: { x: 20, y: 10 },
      },
    ],
    connections: [
      { id: 'edge-1', from: 'source', to: 'breaker' },
      { id: 'edge-2', from: 'breaker', to: 'bus' },
    ],
    suggestedCalculations: [],
    confidence: 0.9,
    rawDescription: '',
  };
}

describe('SLD annotation topology boundary', () => {
  it('keeps read annotations out of the electrical graph and isolated-node count', () => {
    const graph = buildTopologyFromSLD(fixture());
    const validation = graph.validate();

    expect(graph.getNode('flow-note')).toBeUndefined();
    expect(validation.stats).toMatchObject({
      nodeCount: 3,
      edgeCount: 2,
      isolatedNodes: 0,
      connectedComponents: 1,
    });
    expect(validation.issues).not.toContainEqual(expect.objectContaining({
      type: 'ISOLATED_NODE',
      nodeId: 'flow-note',
    }));
  });

  it('still reports a genuinely missing electrical endpoint', () => {
    const input = fixture();
    input.connections.push({ id: 'broken-edge', from: 'bus', to: 'missing-load' });

    expect(buildTopologyFromSLD(input).validate().issues).toContainEqual(
      expect.objectContaining({ type: 'MISSING_EDGE_TARGET', edgeId: 'broken-edge' }),
    );
  });
});
