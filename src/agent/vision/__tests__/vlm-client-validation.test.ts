import { parseVLMResponse } from '../vlm-client';

describe('VLM response validation', () => {
  it('keeps only bounded, well-formed components and connected edges', () => {
    const result = parseVLMResponse(JSON.stringify({
      components: [
        { id: 'panel-1', type: 'panel', label: 'MDB', x: 250, y: 500, confidence: 1.4 },
        { id: 'load-1', type: 'load', label: 'Load', x: 750, y: 500, confidence: 0.8 },
        { id: '', type: 'breaker', label: 'invalid id', x: 10, y: 10, confidence: 0.9 },
        { id: 'outside', type: 'motor', label: 'outside', x: 1001, y: 20, confidence: 0.9 },
      ],
      connections: [
        { from: 'panel-1', to: 'load-1', cableType: 'CV 4sq', length: 12.5 },
        { from: 'panel-1', to: 'missing', length: 3 },
        { from: 'load-1', to: 'load-1', length: 1 },
      ],
    }), 'test-model', 7);

    expect(result.components).toEqual([
      expect.objectContaining({ id: 'panel-1', confidence: 1, position: { x: 250, y: 500 } }),
      expect.objectContaining({ id: 'load-1', confidence: 0.8, position: { x: 750, y: 500 } }),
    ]);
    expect(result.connections).toEqual([
      expect.objectContaining({ from: 'panel-1', to: 'load-1', length: 12.5 }),
    ]);
    expect(result.confidence).toBe(0.9);
  });

  it('does not turn inferred, negative, or non-finite lengths into physical evidence', () => {
    const result = parseVLMResponse(JSON.stringify({
      components: [
        { id: 'a', type: 'panel', label: 'A', x: 0, y: 0, confidence: 0.7 },
        { id: 'b', type: 'load', label: 'B', x: 1000, y: 1000, confidence: 0.7 },
      ],
      connections: [
        { from: 'a', to: 'b', length: -5 },
        { from: 'a', to: 'b', length: 'not-a-number' },
      ],
    }), 'test-model', 3);

    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).not.toHaveProperty('length');
  });

  it('fails closed on malformed JSON or non-array result fields', () => {
    expect(parseVLMResponse('{bad', 'test-model', 1).components).toEqual([]);
    expect(parseVLMResponse(JSON.stringify({ components: {}, connections: 'x' }), 'test-model', 1).components).toEqual([]);
  });
});
