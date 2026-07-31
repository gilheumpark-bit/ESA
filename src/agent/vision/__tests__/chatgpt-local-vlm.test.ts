import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';

import {
  analyzeDrawingRole,
  analyzeDrawingWithVLM,
} from '../vlm-client';

jest.mock('@/lib/chatgpt-local', () => ({
  runChatGPTLocalTurn: jest.fn(),
}));

const runTurnMock = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;

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
        maxRetries: 0,
      },
    );

    expect(runTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-terra',
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
      outputSchema: expect.any(Object),
    }));
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

    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      id: 'q1',
      type: 'breaker',
      label: 'VCB',
      position: { x: 100, y: 200 },
    });
  });
});
