import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';

import { analyzeSLD } from '../sld-recognition';

jest.mock('@/lib/chatgpt-local', () => ({
  runChatGPTLocalTurn: jest.fn(),
}));

const runTurnMock = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;

describe('legacy SLD recognition local transport', () => {
  it('uses the local image turn and parses the existing SLD JSON contract', async () => {
    runTurnMock.mockResolvedValue({
      text: JSON.stringify({
        components: [],
        connections: [],
        systemVoltage: null,
        systemType: null,
        confidence: 0,
        rawDescription: '',
      }),
      model: 'gpt-5.6-terra',
      durationMs: 10,
    });
    const image = new Blob([
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ], { type: 'image/png' });

    const result = await analyzeSLD(image, {
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
      apiKey: '',
    });

    expect(runTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-terra',
      effort: 'medium',
      input: expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          url: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      ]),
      outputSchema: expect.objectContaining({
        type: 'object',
        additionalProperties: false,
        required: expect.arrayContaining(['components', 'connections', 'confidence']),
      }),
    }));
    const request = runTurnMock.mock.calls[0][0];
    const connectionSchema = (request.outputSchema as {
      properties: { connections: { items: { properties: Record<string, unknown>; required: string[] } } };
    }).properties.connections.items;
    expect(connectionSchema.properties).toHaveProperty('parallelCount');
    expect(connectionSchema.required).toContain('parallelCount');
    expect(request.developerInstructions).toContain('Do not collapse repeated feeders');
    expect(request.developerInstructions).toContain('Classify a drawn device by its glyph');
    expect(request.developerInstructions).toContain('HV/MV substation');
    expect(request.developerInstructions).toContain('Before returning, rescan left-to-right');
    expect(result).toMatchObject({
      components: [],
      connections: [],
      confidence: 0,
    });
  });
});
