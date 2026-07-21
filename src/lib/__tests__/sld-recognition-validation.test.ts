import { parseSLDResponse } from '../sld-recognition';

describe('SLD recognition response validation', () => {
  it('drops unknown components, dangling edges, and lengths without explicit units', () => {
    const parsed = parseSLDResponse(JSON.stringify({
      components: [
        { id: 'p1', type: 'panel', label: 'MDB', position: { x: 10, y: 20 } },
        { id: 'l1', type: 'load', label: 'Load', position: { x: 90, y: 80 } },
        { id: 'bad-type', type: 'dragon', position: { x: 50, y: 50 } },
        { id: 'outside', type: 'motor', position: { x: 101, y: 50 } },
      ],
      connections: [
        { id: 'e1', from: 'p1', to: 'l1', length: '12.5m' },
        { id: 'e2', from: 'p1', to: 'missing', length: '2m' },
        { id: 'e3', from: 'p1', to: 'l1', length: 'approximately 12' },
      ],
      confidence: 4,
    }));

    expect(parsed.components.map(component => component.id)).toEqual(['p1', 'l1']);
    expect(parsed.connections).toEqual([
      expect.objectContaining({ id: 'e1', from: 'p1', to: 'l1', length: '12.5m' }),
      expect.objectContaining({ id: 'e3', from: 'p1', to: 'l1' }),
    ]);
    expect(parsed.connections[1].length).toBeUndefined();
    expect(parsed.confidence).toBe(1);
  });

  it('fails closed instead of assigning confidence to malformed output', () => {
    expect(parseSLDResponse('not json')).toEqual(expect.objectContaining({
      components: [],
      connections: [],
      confidence: 0,
    }));
    expect(parseSLDResponse(JSON.stringify({ components: {}, connections: [] }))).toEqual(expect.objectContaining({
      components: [],
      connections: [],
      confidence: 0,
    }));
  });
});
