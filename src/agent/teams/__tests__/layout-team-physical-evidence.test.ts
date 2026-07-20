import { executeLayoutTeam } from '../layout-team';
import { splitAndAnalyze } from '../../vision/vision-splitter';

jest.mock('../../vision/vision-splitter', () => ({
  ...jest.requireActual('../../vision/vision-splitter'),
  splitAndAnalyze: jest.fn(),
}));

const mockSplitAndAnalyze = jest.mocked(splitAndAnalyze);
const requestScopedKey = ['request', 'only', 'gemini', 'key', 'value'].join('-');

function bufferFrom(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function dxfWithPanelAndLoad(): string {
  return [
    'INSERT', 'LAYER', 'PANEL', '10', '0', '20', '0',
    'INSERT', 'LAYER', 'OUTLET', '10', '3', '20', '4',
  ].join('\n');
}

describe('layout team physical-evidence boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not convert unitless DXF coordinates into metres', async () => {
    const result = await executeLayoutTeam({
      sessionId: 'unitless-dxf',
      classification: 'layout_dxf',
      fileBuffer: bufferFrom(dxfWithPanelAndLoad()),
      fileName: 'unitless.dxf',
      mimeType: 'application/dxf',
    });

    expect(result.success).toBe(true);
    expect(result.calculations?.some(calc => calc.calculatorId === 'wiring-distance')).toBe(false);
    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({ judgment: 'HOLD', note: expect.stringMatching(/축척|단위/) }),
    ]));
  });

  it('computes a route only when a caller supplies a valid coordinate scale', async () => {
    const result = await executeLayoutTeam({
      sessionId: 'scaled-dxf',
      classification: 'layout_dxf',
      fileBuffer: bufferFrom(dxfWithPanelAndLoad()),
      fileName: 'scaled.dxf',
      mimeType: 'application/dxf',
      params: { unitScale: 1 },
    });

    const distance = result.calculations?.find(calc => calc.calculatorId === 'wiring-distance');
    expect(distance?.value).toBeCloseTo(7, 6);
    expect(result.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ length: 7 }),
    ]));
  });

  it('does not invent a five-metre image connection or a cable specification', async () => {
    mockSplitAndAnalyze.mockResolvedValue([{
      regionIndex: 0,
      regionBounds: { x: 0, y: 0, w: 1000, h: 1000 },
      components: [
        { id: 'panel', type: 'panel', label: 'MDB', position: { x: 100, y: 100 }, confidence: 0.9 },
        { id: 'load', type: 'outlet', label: 'Outlet', position: { x: 900, y: 900 }, confidence: 0.9 },
      ],
      connections: [{ from: 'panel', to: 'load' }],
      texts: [],
      regionConfidence: 0.9,
    }]);

    const result = await executeLayoutTeam({
      sessionId: 'image-no-scale',
      classification: 'layout_image',
      fileBuffer: new Uint8Array([1]).buffer,
      fileName: 'layout.png',
      mimeType: 'image/png',
      vision: { provider: 'gemini', apiKey: requestScopedKey },
    });

    expect(result.connections).toEqual([
      expect.objectContaining({ from: 'panel', to: 'load' }),
    ]);
    expect(result.connections?.[0].length).toBeUndefined();
    expect(result.connections?.[0].cableType).toBeUndefined();
    expect(result.calculations?.some(calc => calc.calculatorId === 'wiring-distance')).toBe(false);
    expect(result.calculations?.some(calc => calc.calculatorId === 'conduit-sizing')).toBe(false);
  });
});
