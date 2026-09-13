import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';
import {
  analyzeSLDWithLunaFastPath,
  shouldUseLunaSldFastPath,
} from '@/lib/sld-luna-fast-path';

jest.mock('@/lib/chatgpt-local', () => ({
  runChatGPTLocalTurn: jest.fn(),
}));

const runTurnMock = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;

function response(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    components: [{
      id: 'q1',
      type: 'breaker',
      label: 'MCCB 100A',
      rating: '100A',
      voltage: null,
      current: null,
      position: { x: 50, y: 35 },
    }],
    connections: [],
    systemVoltage: null,
    systemType: null,
    confidence: 0.9,
    rawDescription: 'simple feeder',
    ...overrides,
  });
}

describe('Luna simple SLD fast path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes only Luna on ChatGPT local or OpenAI', () => {
    expect(shouldUseLunaSldFastPath('chatgpt-local', 'gpt-5.6-luna')).toBe(true);
    expect(shouldUseLunaSldFastPath('openai', 'gpt-5.6-luna')).toBe(true);
    expect(shouldUseLunaSldFastPath('chatgpt-local', 'gpt-5.6-terra')).toBe(false);
    expect(shouldUseLunaSldFastPath('gemini', 'gpt-5.6-luna')).toBe(false);
  });

  it('uses a compact schema and high-detail first pass for local Luna', async () => {
    runTurnMock.mockResolvedValue({
      text: response(),
      model: 'gpt-5.6-luna',
      durationMs: 20,
    });

    const result = await analyzeSLDWithLunaFastPath(
      new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }),
      { provider: 'chatgpt-local', model: 'gpt-5.6-luna', apiKey: '' },
    );

    expect(runTurnMock).toHaveBeenCalledTimes(1);
    const request = runTurnMock.mock.calls[0]?.[0];
    expect(request).toEqual(expect.objectContaining({
      model: 'gpt-5.6-luna',
      effort: 'medium',
      timeoutMs: 120_000,
      developerInstructions: expect.stringContaining('reliable extraction'),
      input: expect.arrayContaining([
        expect.objectContaining({ type: 'image', detail: 'high' }),
      ]),
    }));

    const schema = request?.outputSchema as {
      properties?: {
        connections?: {
          items?: { required?: string[]; properties?: Record<string, unknown> };
        };
      };
    };
    expect(schema.properties?.connections?.items?.required).toEqual([
      'id', 'from', 'to', 'cableType', 'length', 'conductorSize',
    ]);
    expect(Object.keys(schema.properties?.connections?.items?.properties ?? {})).toHaveLength(6);
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      id: 'q1',
      type: 'breaker',
      label: 'MCCB 100A',
    });
    expect(result.warnings).toContain('LUNA_FAST_PATH_REDUCED_SCOPE');
  });

  it('retries once with original detail and high effort only after an empty first pass', async () => {
    runTurnMock
      .mockResolvedValueOnce({
        text: response({ components: [], confidence: 0, rawDescription: 'nothing found' }),
        model: 'gpt-5.6-luna',
        durationMs: 15,
      })
      .mockResolvedValueOnce({
        text: response(),
        model: 'gpt-5.6-luna',
        durationMs: 25,
      });

    const result = await analyzeSLDWithLunaFastPath(
      new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }),
      { provider: 'chatgpt-local', model: 'gpt-5.6-luna', apiKey: '' },
    );

    expect(runTurnMock).toHaveBeenCalledTimes(2);
    expect(runTurnMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      effort: 'medium',
      input: expect.arrayContaining([expect.objectContaining({ detail: 'high' })]),
    }));
    expect(runTurnMock.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      effort: 'high',
      developerInstructions: expect.stringContaining('RECOVERY PASS'),
      input: expect.arrayContaining([expect.objectContaining({ detail: 'original' })]),
    }));
    expect(result.components).toHaveLength(1);
    expect(result.warnings).toEqual(expect.arrayContaining([
      'LUNA_FAST_PATH_REDUCED_SCOPE',
      'LUNA_FAST_PATH_RECOVERY_PASS',
    ]));
  });
});
