import { buildTopologyFromSLD } from '@/engine/topology';
import { orderSLDConnectionEndpoints } from '@/lib/sld-flow-display';
import {
  parseSLDResponse,
  SLD_COMPONENT_TYPES,
  type SLDAnalysis,
} from '@/lib/sld-recognition';

describe('SLD domain contract — grid boundary, reactor, and measured branch flow', () => {
  it('preserves grid boundaries and reactors instead of forcing them into source/load/capacitor', () => {
    const parsed = parseSLDResponse(JSON.stringify({
      components: [
        {
          id: 'grid_1',
          type: 'grid_connection',
          label: 'External grid boundary',
          position: { x: 10, y: 5 },
        },
        {
          id: 'reactor_1',
          type: 'reactor',
          label: 'Shunt reactor',
          position: { x: 90, y: 80 },
        },
      ],
      connections: [
        {
          id: 'flow_1',
          from: 'grid_1',
          to: 'reactor_1',
          activePower: '75 MW',
          reactivePower: '23 MVAR',
          flowDirection: 'to_from',
        },
      ],
      confidence: 0.9,
      rawDescription: 'External grid and shunt reactor branch',
    }));

    expect(SLD_COMPONENT_TYPES).toEqual(expect.arrayContaining(['grid_connection', 'reactor']));
    expect(parsed.components.map((component) => component.type)).toEqual([
      'grid_connection',
      'reactor',
    ]);
    expect(parsed.connections[0]).toEqual(expect.objectContaining({
      activePower: '75 MW',
      reactivePower: '23 MVAR',
      flowDirection: 'to_from',
    }));
  });

  it('orders displayed endpoints by the measured power-flow direction', () => {
    expect(orderSLDConnectionEndpoints({ from: 'grid_1', to: 'bus_1', flowDirection: 'from_to' }))
      .toEqual({ from: 'grid_1', to: 'bus_1' });
    expect(orderSLDConnectionEndpoints({ from: 'grid_1', to: 'bus_1', flowDirection: 'to_from' }))
      .toEqual({ from: 'bus_1', to: 'grid_1' });
  });

  it('marks a one-sided inline breaker as an incomplete relation', () => {
    const analysis = {
      components: [
        { id: 'bus_1', type: 'bus', position: { x: 10, y: 50 } },
        { id: 'breaker_1', type: 'breaker', position: { x: 50, y: 50 } },
      ],
      connections: [{ id: 'edge_1', from: 'bus_1', to: 'breaker_1' }],
      suggestedCalculations: [],
      confidence: 0.9,
      rawDescription: 'breaker output missing',
    } as unknown as SLDAnalysis;

    expect(buildTopologyFromSLD(analysis).validate().issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'DANGLING_INLINE_DEVICE', nodeId: 'breaker_1' }),
    ]));
  });

  it('holds a power-flow label copied onto both sides of the same inline device', () => {
    const analysis = {
      components: [
        { id: 'grid_1', type: 'grid_connection', position: { x: 10, y: 10 } },
        { id: 'breaker_1', type: 'breaker', position: { x: 10, y: 30 } },
        { id: 'bus_1', type: 'bus', position: { x: 10, y: 50 } },
      ],
      connections: [
        {
          id: 'edge_1', from: 'grid_1', to: 'breaker_1',
          activePower: '75 MW', reactivePower: '23 MVAR', flowDirection: 'from_to',
        },
        {
          id: 'edge_2', from: 'breaker_1', to: 'bus_1',
          activePower: '75 MW', reactivePower: '23 MVAR', flowDirection: 'from_to',
        },
      ],
      suggestedCalculations: [],
      confidence: 0.9,
      rawDescription: 'one printed flow label copied to adjacent segments',
    } as unknown as SLDAnalysis;

    expect(buildTopologyFromSLD(analysis).validate().issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'DUPLICATE_FLOW_MEASUREMENT',
        nodeId: 'breaker_1',
      }),
    ]));
  });
});
