import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';
import { analyzeSLDWithLunaFastPath } from '@/lib/sld-luna-fast-path';

jest.mock('@/lib/chatgpt-local', () => ({ runChatGPTLocalTurn: jest.fn() }));
const local = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;
const originalFetch = global.fetch;
const options = { provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'test-only-not-a-secret' };
const image = () => new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
const component = (id: string, x = 20) => ({
  id, type: 'breaker', label: 'QF', rating: null, voltage: null, current: null,
  position: { x, y: 30 },
});
function drawing(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sheetKind: 'sld', components: [component('q1')], connections: [],
    systemVoltage: null, systemType: null, confidence: 0.99, rawDescription: 'test fixture', ...extra,
  });
}
function completion(text: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: text }, ...extra }] }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
function reply(text: string) {
  return { text, model: 'gpt-5.6-luna', durationMs: 1 };
}
function fetchMock(response: () => Response) {
  const mock = jest.fn(async () => response());
  global.fetch = mock as typeof fetch;
  return mock;
}
function requestBody(mock: jest.Mock): Record<string, unknown> {
  return JSON.parse(String((mock.mock.calls[0]?.[1] as RequestInit)?.body));
}

afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers(); });
beforeEach(() => { local.mockReset(); });

describe('Luna transport and evidence regressions', () => {
  it('actually sends an abort signal and explicit reasoning effort to OpenAI', async () => {
    const mock = fetchMock(() => completion(drawing()));
    await analyzeSLDWithLunaFastPath(image(), options);
    expect((mock.mock.calls[0]?.[1] as RequestInit)?.signal).toBeInstanceOf(AbortSignal);
    expect(requestBody(mock)).toMatchObject({ reasoning_effort: 'medium', max_completion_tokens: 8192 });
    expect(requestBody(mock)).not.toHaveProperty('temperature');
  });

  it('honors requested high effort rather than silently lowering it', async () => {
    const mock = fetchMock(() => completion(drawing()));
    await analyzeSLDWithLunaFastPath(image(), { ...options, effort: 'high' } as Parameters<typeof analyzeSLDWithLunaFastPath>[1]);
    expect(requestBody(mock).reasoning_effort).toBe('high');
  });

  it('does not call any provider for a pre-cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    const mock = fetchMock(() => completion(drawing()));
    await expect(analyzeSLDWithLunaFastPath(image(), {
      ...options, signal: controller.signal,
    } as Parameters<typeof analyzeSLDWithLunaFastPath>[1])).rejects.toThrow('LUNA_CANCELLED');
    expect(mock).not.toHaveBeenCalled();
  });

  it('normalizes the model that is actually sent, not only the routing predicate', async () => {
    const mock = fetchMock(() => completion(drawing()));
    await analyzeSLDWithLunaFastPath(image(), { ...options, model: ' GPT-5.6-LUNA ' });
    expect(requestBody(mock).model).toBe('gpt-5.6-luna');
  });

  it('treats refusal as a terminal state without recovery or leaking its prose', async () => {
    const mock = fetchMock(() => completion('', { message: { content: null, refusal: 'private-provider-detail' } }));
    await expect(analyzeSLDWithLunaFastPath(image(), options)).rejects.toThrow('LUNA_REFUSED');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not turn malformed provider envelopes into successful empty drawings', async () => {
    const mock = fetchMock(() => new Response('{"choices":[]}'));
    await expect(analyzeSLDWithLunaFastPath(image(), options)).rejects.toThrow('LUNA_INVALID_OUTPUT');
    expect(mock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('fails explicitly after two valid but unusable SLD reads', async () => {
    local.mockResolvedValue(reply(drawing({ components: [] })));
    await expect(analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' }))
      .rejects.toThrow('LUNA_EMPTY_RESULT');
    expect(local).toHaveBeenCalledTimes(2);
  });

  it('allows an explicit non-electrical sheet without pressuring a second call to invent devices', async () => {
    local.mockResolvedValue(reply(drawing({ sheetKind: 'non-electrical', components: [] })));
    const result = await analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' });
    expect(local).toHaveBeenCalledTimes(1);
    expect(result.warnings).toContain('LUNA_NO_ELECTRICAL_SYMBOLS');
    expect(result.confidence).toBe(0);
  });

  it('does not accept contradictory non-electrical and nonempty output', async () => {
    local.mockResolvedValue(reply(drawing({ sheetKind: 'non-electrical' })));
    await expect(analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' }))
      .rejects.toThrow('LUNA_INVALID_OUTPUT');
  });

  it('drops model-smuggled safety inputs before the permissive shared parser', async () => {
    local.mockResolvedValue(reply(drawing({
      components: [component('q1'), component('q2', 60)],
      connections: [{ id: 'c1', from: 'q1', to: 'q2', cableType: null, length: null, conductorSize: null,
        sourceIds: ['invented-evidence'], breakingCapacityKA: 999, prospectiveFaultCurrentKA: 1,
        shortCircuitLetThroughEnergyA2s: 1, overloadProtectionWithstandEnergyA2s: 999,
        parallelCount: 64 }],
    })));
    const result = await analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' });
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).not.toHaveProperty('breakingCapacityKA');
    expect(result.connections[0]).not.toHaveProperty('sourceIds');
    expect(result.connections[0]).not.toHaveProperty('parallelCount');
    expect(result.suggestedCalculations).toEqual([]);
    expect(result.warnings).toContain('LUNA_UNEXPECTED_FIELDS_DROPPED');
  });

  it('rejects all duplicate component identities instead of binding edges to the first one', async () => {
    local.mockResolvedValue(reply(drawing({
      components: [component('q1'), { ...component('q1', 60), type: 'motor' }, component('q3', 80)],
      connections: [{ id: 'c1', from: 'q1', to: 'q3', cableType: null, length: null, conductorSize: null }],
    })));
    const result = await analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' });
    expect(result.components.map((c) => c.id)).toEqual(['q3']);
    expect(result.connections).toEqual([]);
    expect(result.warnings).toContain('LUNA_INVALID_RECORDS_DROPPED');
  });

  it('marks nonempty disconnected results for review even at model confidence 0.99', async () => {
    local.mockResolvedValue(reply(drawing({ components: [component('q1'), component('q2', 60)] })));
    const result = await analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' });
    expect(result.components).toHaveLength(2);
    expect(result.warnings).toContain('LUNA_TOPOLOGY_REVIEW_REQUIRED');
    expect(result.suggestedCalculations).toEqual([]);
    expect(local).toHaveBeenCalledTimes(1);
  });

  it('reports discarded out-of-bounds records rather than hiding the loss', async () => {
    local.mockResolvedValue(reply(drawing({ components: [component('q1'), component('q2', 1001)] })));
    const result = await analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' });
    expect(result.components).toHaveLength(1);
    expect(result.warnings).toContain('LUNA_INVALID_RECORDS_DROPPED');
  });

  it('retains valid JSON explicitly truncated by the provider only as partial evidence', async () => {
    const mock = fetchMock(() => completion(drawing(), { finish_reason: 'length' }));
    const result = await analyzeSLDWithLunaFastPath(image(), options);
    expect(result.partial).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
    expect(result.warnings).toContain('LUNA_OUTPUT_TRUNCATED');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('never repairs an unfinished component into a usable device', async () => {
    local.mockResolvedValue(reply('{"components":[{"id":"q1","type":"breaker","position":{"x":20,"y":30}}'));
    await expect(analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' }))
      .rejects.toThrow('LUNA_INVALID_OUTPUT');
  });

  it('rejects an excessive declared response size without reading it as a drawing', async () => {
    const mock = fetchMock(() => new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024) } }));
    await expect(analyzeSLDWithLunaFastPath(image(), options)).rejects.toThrow('LUNA_RESPONSE_LIMIT');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('keeps HTTP authentication failures terminal', async () => {
    const mock = fetchMock(() => new Response('private-provider-detail', { status: 401 }));
    await expect(analyzeSLDWithLunaFastPath(image(), options)).rejects.toThrow('LUNA_AUTH_REQUIRED');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not automatically retry rate or quota limits', async () => {
    const mock = fetchMock(() => new Response('private-provider-detail', { status: 429 }));
    await expect(analyzeSLDWithLunaFastPath(image(), options)).rejects.toThrow('LUNA_RATE_LIMIT');
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
