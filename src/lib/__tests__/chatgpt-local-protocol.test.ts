import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  CodexAppServerClient,
  type CodexAppServerProcess,
  type LocalTurnParams,
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

  it('턴 실패 사유를 버리지 않고 경계 지어 싣는다', async () => {
    // 2026-08-07 실측: 교재형 도면 68호출이 전부 `LOCAL_CODEX_TURN_FAILED` 였는데
    // 사유가 없어 **할당량 소진인지·미로그인인지·모델 거부인지 구분할 수 없었다.**
    // 원장 6차의 스키마 일괄 실패도 같은 형태로 23%·관계 0% 를 냈다 — 성능
    // 수치처럼 보이지만 실행 실패다. 사유가 없으면 그 둘을 못 가른다.
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({ spawnProcess: () => process, defaultTimeoutMs: 1_000 });
    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Return only the requested electrical answer.',
      input: [{ type: 'text', text: '판독' }],
      cwd: 'C:\empty-esa-runtime',
    });
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-1' } } });
    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-1' } } });
    process.emitJson({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'failed', reason: 'usage_limit_reached', items: [] } },
    });

    await expect(pending).rejects.toThrow(/LOCAL_CODEX_TURN_FAILED/);
    client.close();
  });

  it('턴 실패 사유에 status 와 reason 코드가 함께 남는다', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({ spawnProcess: () => process, defaultTimeoutMs: 1_000 });
    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Return only the requested electrical answer.',
      input: [{ type: 'text', text: '판독' }],
      cwd: 'C:\empty-esa-runtime',
    });
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-1' } } });
    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-1' } } });
    process.emitJson({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'failed', reason: 'usage_limit_reached', items: [] } },
    });

    const error = await pending.then(() => null, (caught: Error) => caught);
    expect(error?.message).toContain('status=failed');
    expect(error?.message).toContain('reason=usage_limit_reached');
    client.close();
  });

  it('stderr 의 할당량 소진을 코드로 분류해 실패에 싣는다', async () => {
    // 실측(2026-08-07): CLI 는 `You've hit your usage limit …` 을 stderr 에 적는데
    // `turn/completed` 페이로드에는 status 만 온다. 종전에는 stderr 를
    // `resume()` 으로 흘려버려서, 68호출 전부 실패한 원인을 영수증으로 못 찾고
    // CLI 를 손으로 두드려서야 알았다.
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({ spawnProcess: () => process, defaultTimeoutMs: 1_000 });
    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Return only the requested electrical answer.',
      input: [{ type: 'text', text: '판독' }],
      cwd: 'C:\empty-esa-runtime',
    });
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-1' } } });
    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-1' } } });
    process.stderr.emit('data', "ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.");
    process.emitJson({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'failed', items: [] } },
    });

    const error = await pending.then(() => null, (caught: Error) => caught);
    expect(error?.message).toContain('LOCAL_CODEX_USAGE_LIMIT');
    // 원문·URL 은 싣지 않는다.
    expect(error?.message).not.toContain('chatgpt.com');
    client.close();
  });

  it('공급자 자유 서술은 오류 문구에 싣지 않는다', async () => {
    // 응답 전문·키가 오류로 새지 않게 짧은 코드 형태만 받는다.
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({ spawnProcess: () => process, defaultTimeoutMs: 1_000 });
    const pending = client.runTurn({
      model: 'gpt-5.6-terra',
      developerInstructions: 'Return only the requested electrical answer.',
      input: [{ type: 'text', text: '판독' }],
      cwd: 'C:\empty-esa-runtime',
    });
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-1' } } });
    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-1' } } });
    process.emitJson({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'failed', reason: 'Your API key sk-abc123 was rejected: see https://example.com', items: [] } },
    });

    const error = await pending.then(() => null, (caught: Error) => caught);
    expect(error?.message).toContain('LOCAL_CODEX_TURN_FAILED');
    expect(error?.message).not.toContain('sk-abc123');
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

  it('forwards an explicit reasoning effort to the app-server turn', async () => {
    const process = new FakeCodexProcess();
    const client = new CodexAppServerClient({
      spawnProcess: () => process,
      defaultTimeoutMs: 1_000,
    });
    const params = {
      model: 'gpt-5.6-sol',
      effort: 'medium',
      developerInstructions: 'Return JSON only.',
      input: [{ type: 'text' as const, text: 'Analyze the diagram.' }],
      cwd: 'C:\\empty-esa-runtime',
    } as unknown as LocalTurnParams;

    const pending = client.runTurn(params);
    const threadRequest = await nextWrittenRequest(process);
    process.emitJson({ id: threadRequest.id, result: { thread: { id: 'thread-effort' } } });

    const turnRequest = await nextWrittenRequest(process, 1);
    process.emitJson({ id: turnRequest.id, result: { turn: { id: 'turn-effort' } } });
    process.emitJson({
      method: 'turn/completed',
      params: {
        threadId: 'thread-effort',
        turn: { id: 'turn-effort', status: 'completed', items: [], durationMs: 1 },
      },
    });

    await expect(pending).resolves.toEqual(expect.objectContaining({ model: 'gpt-5.6-sol' }));
    expect(turnRequest).toMatchObject({
      method: 'turn/start',
      params: {
        threadId: 'thread-effort',
        effort: 'medium',
      },
    });
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
