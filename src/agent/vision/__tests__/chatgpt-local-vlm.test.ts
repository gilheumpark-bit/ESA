import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';

import {
  analyzeDrawingRole,
  analyzeDrawingWithVLM,
} from '../vlm-client';

jest.mock('@/lib/chatgpt-local', () => ({
  runChatGPTLocalTurn: jest.fn(),
}));

const runTurnMock = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;

function expectEveryObjectPropertyRequired(schema: unknown): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  const value = schema as Record<string, unknown>;
  if (value.type === 'object') {
    const properties = value.properties as Record<string, unknown> | undefined;
    expect(value.additionalProperties).toBe(false);
    expect(new Set(value.required as string[] | undefined)).toEqual(
      new Set(Object.keys(properties ?? {})),
    );
  }
  for (const child of Object.values(value)) expectEveryObjectPropertyRequired(child);
}

describe('ChatGPT local VLM transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the image and role prompt through the local Codex turn without an API key', async () => {
    runTurnMock.mockResolvedValue({
      text: JSON.stringify({
        texts: [],
        warnings: [],
        confidence: 0,
      }),
      model: 'gpt-5.6-terra',
      durationMs: 12,
    });

    const result = await analyzeDrawingRole(
      new Uint8Array([137, 80, 78, 71]).buffer,
      'image/png',
      'text',
      {
        provider: 'chatgpt-local',
        model: 'gpt-5.6-terra',
        effort: 'high',
        maxRetries: 0,
      } as never,
    );

    const request = runTurnMock.mock.calls[0]?.[0];
    expect(request).toEqual(expect.objectContaining({
      model: 'gpt-5.6-terra',
      effort: 'high',
      developerInstructions: expect.stringContaining('Read every equipment label'),
      input: [
        {
          type: 'image',
          url: 'data:image/png;base64,iVBORw==',
          detail: 'original',
        },
        {
          type: 'text',
          text: expect.stringContaining('Return JSON only'),
        },
      ],
    }));
    expect(request).toEqual(expect.objectContaining({
      outputSchema: expect.objectContaining({
        type: 'object',
        additionalProperties: false,
        required: ['texts', 'warnings', 'confidence'],
        properties: expect.objectContaining({
          texts: expect.any(Object),
          warnings: expect.any(Object),
          confidence: expect.any(Object),
        }),
      }),
    }));
    expect(request?.outputSchema).not.toHaveProperty('properties.symbols');
    expectEveryObjectPropertyRequired(request?.outputSchema);
    expect(result).toMatchObject({
      role: 'text',
      model: 'gpt-5.6-terra',
      data: { texts: [], warnings: [], confidence: 0 },
    });
  });

  it('uses the same strict parser for full-drawing local output', async () => {
    runTurnMock.mockResolvedValue({
      text: JSON.stringify({
        components: [{
          id: 'q1',
          type: 'breaker',
          label: 'VCB',
          x: 100,
          y: 200,
          confidence: 0.9,
        }],
        connections: [],
      }),
      model: 'gpt-5.6-terra',
      durationMs: 9,
    });

    const result = await analyzeDrawingWithVLM(
      new Uint8Array([137, 80, 78, 71]).buffer,
      'image/png',
      {
        provider: 'chatgpt-local',
        model: 'gpt-5.6-terra',
        maxRetries: 0,
      },
    );

    expect(runTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      outputSchema: expect.objectContaining({
        type: 'object',
        additionalProperties: false,
        required: ['components', 'connections'],
      }),
    }));
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      id: 'q1',
      type: 'breaker',
      label: 'VCB',
      position: { x: 100, y: 200 },
    });
  });
});
