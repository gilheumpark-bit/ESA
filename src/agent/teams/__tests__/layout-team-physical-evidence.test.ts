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

  it('selects the Agent Platform deployment key when it is the only server vision provider', async () => {
    const previousAgent = process.env.GOOGLE_VERTEX_API_KEY;
    const previousGemini = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.GOOGLE_VERTEX_API_KEY = ['agent', 'platform', 'deployment', 'key'].join('-');
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    mockSplitAndAnalyze.mockResolvedValue([]);

    try {
      await executeLayoutTeam({
        sessionId: 'agent-platform-layout',
        classification: 'layout_image',
        fileBuffer: new Uint8Array([1]).buffer,
        fileName: 'layout.png',
        mimeType: 'image/png',
      });

      expect(mockSplitAndAnalyze).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({
        model: 'google-agent-platform',
      }));
    } finally {
      if (previousAgent === undefined) delete process.env.GOOGLE_VERTEX_API_KEY;
      else process.env.GOOGLE_VERTEX_API_KEY = previousAgent;
      if (previousGemini === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousGemini;
      if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
      if (previousAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousAnthropic;
    }
  });

  /**
   * 사용자가 고른 로컬 공급자를 말없이 원격(Gemini)으로 바꾸던 자리다. 그 결과
   * ChatGPT 모델 이름이 Gemini 로 갔고, 서버 키가 대신 쓰일 수 있었으며, 도면이
   * 사용자가 고르지 않은 외부 서비스로 나갔다.
   */
  it('사용자가 고른 chatgpt-local 을 원격 공급자로 바꾸지 않는다', async () => {
    mockSplitAndAnalyze.mockResolvedValue([]);

    await executeLayoutTeam({
      sessionId: 'local-layout',
      classification: 'layout_image',
      fileBuffer: new Uint8Array([1]).buffer,
      fileName: 'layout.png',
      mimeType: 'image/png',
      vision: { provider: 'chatgpt-local', model: 'local-model' },
    });

    expect(mockSplitAndAnalyze).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.objectContaining({
      model: 'chatgpt-local',
      modelName: 'local-model',
    }));
  });

  it('분할 판독이 지원하지 않는 claude-local 은 원격으로 돌리지 않고 이유를 밝히며 실패한다', async () => {
    mockSplitAndAnalyze.mockResolvedValue([]);

    const result = await executeLayoutTeam({
      sessionId: 'claude-local-layout',
      classification: 'layout_image',
      fileBuffer: new Uint8Array([1]).buffer,
      fileName: 'layout.png',
      mimeType: 'image/png',
      vision: { provider: 'claude-local' },
    });

    expect(mockSplitAndAnalyze).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/claude-local/);
  });
});
