import { readElectricalChatResponse } from '@/lib/electrical-chat-client';

describe('readElectricalChatResponse', () => {
  test('collects filtered text and the deterministic calculator receipt from SSE', async () => {
    const body = [
      'data: {"calculation":{"calculatorId":"voltage-drop","calculatorName":"전압강하"}}',
      '',
      'data: {"text":"계산 결과입니다."}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const updates: string[] = [];

    const result = await readElectricalChatResponse(
      new Response(body, { status: 200 }),
      (text) => updates.push(text),
    );

    expect(result.text).toBe('계산 결과입니다.');
    expect(result.calculation).toEqual({
      calculatorId: 'voltage-drop',
      calculatorName: '전압강하',
    });
    expect(updates).toEqual(['계산 결과입니다.']);
  });

  test('surfaces an SSE provider error instead of returning an empty answer', async () => {
    const body = 'data: {"error":"공급자 호출 실패","code":"ESVA-3998"}\n\n';

    await expect(readElectricalChatResponse(new Response(body, { status: 200 })))
      .rejects.toThrow('공급자 호출 실패');
  });
});
