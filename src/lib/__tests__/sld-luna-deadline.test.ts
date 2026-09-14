import { runChatGPTLocalTurn } from '@/lib/chatgpt-local';
import { analyzeSLDWithLunaFastPath } from '@/lib/sld-luna-fast-path';

jest.mock('@/lib/chatgpt-local', () => ({ runChatGPTLocalTurn: jest.fn() }));
const local = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;
const options = { provider: 'openai' as const, model: 'gpt-5.6-luna', apiKey: 'test-key' };
const image = () => new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' });
const empty = JSON.stringify({ sheetKind: 'sld', components: [], connections: [], systemVoltage: null, systemType: null, confidence: 0, rawDescription: 'not read' });

function outcome(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: Error) => error);
}

describe('Luna real deadline and stream boundary', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('aborts a request that never returns headers at the actual deadline', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const mock = jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      signal = init?.signal;
      return new Promise<Response>(() => {});
    });
    const result = outcome(analyzeSLDWithLunaFastPath(image(), options));
    await jest.advanceTimersByTimeAsync(120_000);
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('LUNA_TIMEOUT') }));
    expect(signal?.aborted).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('cancels a stalled response body as well as the fetch request', async () => {
    const controller = new AbortController();
    const cancel = jest.fn();
    let bodyRequested!: () => void;
    const started = new Promise<void>((resolve) => { bodyRequested = resolve; });
    // Zero prefetch means pull happens only after readBoundedBody attaches its reader.
    const body = new ReadableStream<Uint8Array>({ pull() { bodyRequested(); }, cancel }, { highWaterMark: 0 });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    const result = outcome(analyzeSLDWithLunaFastPath(image(), { ...options, signal: controller.signal }));
    await started;
    controller.abort();
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('LUNA_CANCELLED') }));
    expect(cancel).toHaveBeenCalled();
  });

  it('enforces the actual streamed size even without content-length', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel,
    });
    const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    await expect(analyzeSLDWithLunaFastPath(image(), options)).rejects.toThrow('LUNA_RESPONSE_LIMIT');
    expect(cancel).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('caps both local passes together rather than restarting the whole time budget', async () => {
    jest.useFakeTimers();
    local.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve({ text: empty, model: options.model, durationMs: 100_000 }), 100_000);
    })).mockImplementationOnce(() => new Promise(() => {}));
    const result = outcome(analyzeSLDWithLunaFastPath(image(), { ...options, provider: 'chatgpt-local', apiKey: '' }));
    await jest.advanceTimersByTimeAsync(100_000);
    expect(local).toHaveBeenCalledTimes(2);
    expect(local.mock.calls[1][0].timeoutMs).toBe(80_000);
    expect(local.mock.calls[1][0].maxOutputBytes).toBe(1024 * 1024);
    await jest.advanceTimersByTimeAsync(80_000);
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('LUNA_TIMEOUT') }));
    expect(local.mock.calls[1][0].signal?.aborted).toBe(true);
  });
});
