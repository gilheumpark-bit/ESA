import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  CodexAppServerClient,
  type CodexAppServerProcess,
} from '@/lib/chatgpt-local-protocol';

class FakeCodexProcess extends EventEmitter implements CodexAppServerProcess {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly writes: string[] = [];
  killed = false;

  constructor() {
    super();
    this.stdin.setEncoding('utf8');
    this.stdin.on('data', (chunk) => this.writes.push(String(chunk)));
  }

  kill(): boolean {
    this.killed = true;
    this.emit('exit', 0, null);
    return true;
  }

  emitJson(value: unknown, splitAt?: number): void {
    const line = `${JSON.stringify(value)}\n`;
    if (splitAt && splitAt > 0 && splitAt < line.length) {
      this.stdout.write(line.slice(0, splitAt));
      this.stdout.write(line.slice(splitAt));
      return;
    }
    this.stdout.write(line);
  }
}

async function nextWrittenRequest(process: FakeCodexProcess, index = 0) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const lines = process.writes.join('').split('\n').filter(Boolean);
    if (lines[index]) return JSON.parse(lines[index]) as { id: number; method: string; params: unknown };
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('request was not written');
}

describe('Codex app-server JSON-RPC transport', () => {
  it('matches a split JSONL response to the request id', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 1_000,
    });

    const pending = client.request<{ account: { type: string } }>('account/read', {
      refreshToken: false,
    });
    const outbound = await nextWrittenRequest(process);

    expect(outbound.method).toBe('account/read');
    process.emitJson({
      id: outbound.id,
      result: { account: { type: 'chatgpt' } },
    }, 11);

    await expect(pending).resolves.toEqual({ account: { type: 'chatgpt' } });
    client.close();
  });

  it('rejects every pending request when app-server exits', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 1_000,
    });

    const first = client.request('account/read', {});
    const second = client.request('model/list', {});
    await nextWrittenRequest(process, 1);
    process.emit('exit', 1, null);

    await expect(first).rejects.toThrow('LOCAL_CODEX_EXITED');
    await expect(second).rejects.toThrow('LOCAL_CODEX_EXITED');
  });

  it('times out a request without leaving it resolvable by a late response', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 10,
    });

    const pending = client.request('account/read', {});
    const outbound = await nextWrittenRequest(process);

    await expect(pending).rejects.toThrow('LOCAL_CODEX_TIMEOUT');
    process.emitJson({ id: outbound.id, result: { account: { type: 'chatgpt' } } });
    client.close();
  });

  it('collects only the selected turn deltas and completes on turn/completed', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 1_000,
    });
    const deltas: string[] = [];

    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Return only the requested electrical answer.',
      input: [{ type: 'text', text: 'VCB의 역할은?' }],
      cwd: 'C:\\empty-esa-runtime',
      onDelta: (delta) => deltas.push(delta),
    });
    const threadRequest = await nextWrittenRequest(process);
    expect(threadRequest).toMatchObject({
      method: 'thread/start',
      params: {
        model: 'gpt-5.6-terra',
        ephemeral: true,
        approvalPolicy: 'untrusted',
        permissions: ':read-only',
        cwd: 'C:\\empty-esa-runtime',
      },
    });
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-1' } } });

    const turnRequest = await nextWrittenRequest(process, 1);
    expect(turnRequest).toMatchObject({
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [{ type: 'text', text: 'VCB의 역할은?' }],
      },
    });
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-1' } } });
    process.emitJson({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-other', turnId: 'turn-other', itemId: 'i-0', delta: '무시' },
    });
    process.emitJson({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i-1', delta: 'VCB는 ' },
    });
    process.emitJson({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i-1', delta: '차단기입니다.' },
    });
    process.emitJson({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed', items: [], durationMs: 42 },
      },
    });

    await expect(pending).resolves.toEqual({
      text: 'VCB는 차단기입니다.',
      model: 'gpt-5.6-terra',
      durationMs: 42,
    });
    expect(deltas).toEqual(['VCB는 ', '차단기입니다.']);
    client.close();
  });

  it.each(['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch'])(
    'interrupts and discards a turn that starts a %s item',
    async (dangerousType) => {
      const process = new FakeCodexProcess();
      const client = new CodexAppServerClient({
        spawnProcess: () => process,
        defaultTimeoutMs: 1_000,
      });

      const pending = client.runTurn({
        model: 'gpt-5.6-terra',
        developerInstructions: 'Do not use tools.',
        input: [{ type: 'text', text: '도면을 설명해줘' }],
        cwd: 'C:\\empty-esa-runtime',
      });
      const threadRequest = await nextWrittenRequest(process);
      process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-risk' } } });
      const turnRequest = await nextWrittenRequest(process, 1);
      process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-risk' } } });
      process.emitJson({
        method: 'item/started',
        params: {
          threadId: 'thread-risk',
          turnId: 'turn-risk',
          item: { id: 'danger-1', type: dangerousType },
        },
      });

      await expect(pending).rejects.toThrow('LOCAL_CODEX_TOOL_BLOCKED');
      const interruptRequest = await nextWrittenRequest(process, 2);
      expect(interruptRequest).toMatchObject({
        method: 'turn/interrupt',
        params: { threadId: 'thread-risk', turnId: 'turn-risk' },
      });
      client.close();
    },
  );

  it('denies an app-server approval request and discards the turn', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 1_000,
    });

    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Do not use tools.',
      input: [{ type: 'text', text: '도면을 설명해줘' }],
      cwd: 'C:\\empty-esa-runtime',
    });
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-approval' } } });
    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-approval' } } });
    process.emitJson({
      id: 900,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-approval',
        turnId: 'turn-approval',
        itemId: 'command-1',
      },
    });

    await expect(pending).rejects.toThrow('LOCAL_CODEX_TOOL_BLOCKED');
    const written = process.writes.join('').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(written).toContainEqual({
      id: 900,
      error: { code: -32000, message: 'LOCAL_CODEX_TOOL_BLOCKED' },
    });
    client.close();
  });

  it('rejects an active turn when app-server exits', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 1_000,
    });

    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Return text only.',
      input: [{ type: 'text', text: 'VCB란?' }],
      cwd: 'C:\\empty-esa-runtime',
    });
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-exit' } } });
    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-exit' } } });
    await new Promise((resolve) => setImmediate(resolve));
    process.emit('exit', 1, null);

    await expect(pending).rejects.toThrow('LOCAL_CODEX_EXITED');
  });
});
