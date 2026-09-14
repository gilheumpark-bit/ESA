import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { CodexAppServerClient } from '@/lib/chatgpt-local-protocol';

interface RpcRequest { id: number; method: string; params: Record<string, unknown> }
class ManualProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly requests: RpcRequest[] = [];
  constructor() {
    super();
    this.stdin.on('data', (chunk) => {
      const request = JSON.parse(String(chunk)) as RpcRequest;
      this.requests.push(request);
      this.emit('request', request);
      if (request.method === 'turn/interrupt') this.reply(request.id, {});
    });
  }
  kill(): boolean { return true; }
  reply(id: number, result: unknown): void { this.stdout.write(`${JSON.stringify({ id, result })}\n`); }
  notify(method: string, params: unknown): void { this.stdout.write(`${JSON.stringify({ method, params })}\n`); }
  next(method: string): Promise<RpcRequest> {
    const existing = this.requests.find((request) => request.method === method);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const listener = (request: RpcRequest) => {
        if (request.method !== method) return;
        this.removeListener('request', listener);
        resolve(request);
      };
      this.on('request', listener);
    });
  }
}

const params = { model: 'gpt-5.6-luna', developerInstructions: 'Extract only.', input: [{ type: 'text' as const, text: 'test' }], cwd: '/tmp', timeoutMs: 5000 };

async function start(process: ManualProcess): Promise<void> {
  const thread = await process.next('thread/start');
  process.reply(thread.id, { thread: { id: 'thread-1' } });
  const turn = await process.next('turn/start');
  process.reply(turn.id, { turn: { id: 'turn-1' } });
  await Promise.resolve();
}

describe('local turn cancellation and output limits', () => {
  let process: ManualProcess;
  let client: CodexAppServerClient;
  beforeEach(() => {
    process = new ManualProcess();
    client = new CodexAppServerClient({ spawnProcess: () => process });
  });
  afterEach(() => { client.close(); jest.useRealTimers(); });

  it('does not start a model turn after cancellation during thread startup', async () => {
    const controller = new AbortController();
    const result = client.runTurn({ ...params, signal: controller.signal }).catch((error: Error) => error);
    const request = await process.next('thread/start');
    controller.abort();
    process.reply(request.id, { thread: { id: 'thread-1' } });
    expect(await result).toEqual(expect.objectContaining({ message: 'LOCAL_CODEX_ABORTED' }));
    expect(process.requests.map((entry) => entry.method)).not.toContain('turn/start');
  });

  it('interrupts a turn whose id arrives after cancellation', async () => {
    const controller = new AbortController();
    const result = client.runTurn({ ...params, signal: controller.signal }).catch((error: Error) => error);
    const thread = await process.next('thread/start');
    process.reply(thread.id, { thread: { id: 'thread-1' } });
    const turn = await process.next('turn/start');
    controller.abort();
    process.reply(turn.id, { turn: { id: 'turn-1' } });
    expect(await result).toEqual(expect.objectContaining({ message: 'LOCAL_CODEX_ABORTED' }));
    expect(process.requests).toContainEqual(expect.objectContaining({
      method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' },
    }));
  });

  it('checks UTF-8 bytes before appending or delivering a delta', async () => {
    const onDelta = jest.fn();
    const result = client.runTurn({ ...params, maxOutputBytes: 4, onDelta }).catch((error: Error) => error);
    await start(process);
    process.notify('item/agentMessage/delta', { turnId: 'turn-1', delta: '가나' });
    expect(await result).toEqual(expect.objectContaining({ message: 'LOCAL_CODEX_OUTPUT_LIMIT' }));
    expect(onDelta).not.toHaveBeenCalled();
    expect(process.requests.map((entry) => entry.method)).toContain('turn/interrupt');
  });

  it('also bounds completed output delivered without deltas', async () => {
    const result = client.runTurn({ ...params, maxOutputBytes: 4 }).catch((error: Error) => error);
    await start(process);
    process.notify('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [{ type: 'agentMessage', text: '가나' }] } });
    expect(await result).toEqual(expect.objectContaining({ message: 'LOCAL_CODEX_OUTPUT_LIMIT' }));
  });

  it('interrupts timed-out active turns instead of only discarding the UI result', async () => {
    jest.useFakeTimers();
    const result = client.runTurn({ ...params, timeoutMs: 100 }).catch((error: Error) => error);
    await start(process);
    await jest.advanceTimersByTimeAsync(100);
    expect(await result).toEqual(expect.objectContaining({ message: 'LOCAL_CODEX_TIMEOUT' }));
    expect(process.requests.map((entry) => entry.method)).toContain('turn/interrupt');
  });
});
