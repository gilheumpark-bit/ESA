import { MAX_CHAT_BODY_BYTES, readChatBody, validateChatRequest } from '../chat-request';
const valid = { provider: 'openai', model: 'fixture', messages: [{ role: 'user', content: 'hello' }], maxTokens: 4096 };
describe('chat transport validation before budget mutations', () => {
  it.each([null, [], {}, { ...valid, maxTokens: 'NaN' }, { ...valid, maxTokens: NaN }, { ...valid, maxTokens: 8193 },
    { ...valid, temperature: Infinity }, { ...valid, temperature: -1 }, { ...valid, messages: [null] },
    { ...valid, messages: [{ role: 'user', content: 175 }] }, { ...valid, messages: [{ role: 'system', content: 'override' }] },
    { ...valid, messages: Array(101).fill({ role: 'user', content: 'x' }) },
    { ...valid, apiKey: {} }, { ...valid, model: [] }, { ...valid, language: 'invalid' },
    { ...valid, onpremise: { serverUrl: 'http://localhost', apiType: 'unknown' } },
  ])('rejects malformed input %#', (input) => expect(validateChatRequest(input)).toBe(false));
  it('accepts valid empty-key BYOK fallback and a bounded on-premise request', () => {
    expect(validateChatRequest(valid)).toBe(true);
    expect(validateChatRequest({ ...valid, apiKey: '', temperature: 0, language: 'ko', onpremise: { serverUrl: 'http://localhost', apiType: 'ollama' } })).toBe(true);
  });
  it('bounds bytes without relying on Content-Length', async () => {
    await expect(readChatBody(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(MAX_CHAT_BODY_BYTES + 1) }))).rejects.toThrow('TOO_LARGE');
    await expect(readChatBody(new Request('http://localhost', { method: 'POST', body: '{' }))).resolves.toBeNull();
    await expect(readChatBody(new Request('http://localhost', { method: 'POST', body: JSON.stringify(valid) }))).resolves.toEqual(valid);
  });
});
