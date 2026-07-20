import { calculateTokenCost } from '../ai/token-cost';

describe('token cost current and long-context pricing', () => {
  it('uses the published GPT-5.6 Luna standard rates', () => {
    const result = calculateTokenCost({
      model: 'gpt-5.6-luna',
      inputTokens: 1_000,
      outputTokens: 1_000,
      requestCount: 1,
    });
    expect(result.value).toBe(0.007);
  });

  it('applies GPT-5.6 long-context rates to the whole request above 272K input', () => {
    const result = calculateTokenCost({
      model: 'gpt-5.6-luna',
      inputTokens: 300_000,
      outputTokens: 1_000,
      requestCount: 1,
    });
    expect(result.value).toBe(0.609);
    expect(result.judgment?.message).toMatch(/장문 입력 요율/);
  });

  it('applies Gemini 3.1 Pro long-context rates above 200K input', () => {
    const result = calculateTokenCost({
      model: 'gemini-3.1-pro-preview',
      inputTokens: 200_001,
      outputTokens: 1_000,
      requestCount: 1,
    });
    expect(result.value).toBe(0.818004);
  });
});
