import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';

import { recognizeNameplate } from '../ocr-nameplate';

jest.mock('@/lib/chatgpt-local', () => ({
  runChatGPTLocalTurn: jest.fn(),
}));

const runTurnMock = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;

describe('nameplate OCR local transport', () => {
  it('uses the local image turn and the existing nameplate parser', async () => {
    runTurnMock.mockResolvedValue({
      text: JSON.stringify({
        rawText: '380V 100A',
        voltage: '380V',
        current: '100A',
        confidence: 0.9,
        language: 'en',
      }),
      model: 'gpt-5.6-terra',
      durationMs: 10,
    });

    const result = await recognizeNameplate(new Blob([
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ], { type: 'image/png' }), {
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
      apiKey: '',
    });

    expect(runTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-terra',
      input: expect.arrayContaining([
        expect.objectContaining({ type: 'image' }),
      ]),
      outputSchema: expect.objectContaining({
        type: 'object',
        additionalProperties: false,
        required: expect.arrayContaining(['rawText', 'confidence', 'language']),
      }),
    }));
    expect(result).toMatchObject({
      voltage: '380V',
      current: '100A',
      confidence: 0.9,
    });
  });
});
