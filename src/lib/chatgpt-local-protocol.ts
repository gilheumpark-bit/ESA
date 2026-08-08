import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { Readable, Writable } from 'node:stream';

export interface CodexAppServerProcess {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(): boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface CodexAppServerClientOptions {
  spawnProcess?: () => CodexAppServerProcess;
  defaultTimeoutMs?: number;
}

interface RpcResponse {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    message?: string;
  };
}

export type LocalTurnInput =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; detail?: 'auto' | 'low' | 'high' | 'original' };

export type LocalReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

export interface LocalTurnParams {
  model: string;
  developerInstructions: string;
  input: LocalTurnInput[];
  cwd: string;
  outputSchema?: unknown;
  /** Codex app-server turn/start 추론 강도. 모델 간 비교 시 반드시 명시한다. */
  effort?: LocalReasoningEffort;
  signal?: AbortSignal;
  timeoutMs?: number;
  onDelta?: (delta: string) => void;
}

export interface LocalTurnResult {
  text: string;
  model: string;
  durationMs: number;
}

interface ActiveTurn {
  threadId: string;
  turnId: string;
  model: string;
  text: string;
  onDelta?: (delta: string) => void;
  resolve: (result: LocalTurnResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
  stderrCondition: string | null;
}

interface StartingTurn {
  stderrCondition: string | null;
}

const BLOCKED_ITEM_TYPES = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'webSearch',
  'collabAgentToolCall',
]);

/** 공급자 자유 문자열은 길이에 관계없이 싣지 않고, 알려진 상태·코드만 통과시킨다. */
const TURN_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'interrupted', 'incomplete', 'aborted']);
const TURN_FAILURE_CODES = new Set([
  'usage_limit', 'usage_limit_reached', 'quota_exceeded',
  'rate_limit', 'rate_limit_reached', 'too_many_requests',
  'not_logged_in', 'authentication_required', 'unauthorized',
  'unknown_model', 'model_not_found', 'unsupported_model',
  'invalid_request', 'invalid_output_schema',
]);

function knownFailureValue(value: unknown, allowed: ReadonlySet<string>): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[ .-]+/g, '_');
  return allowed.has(normalized) ? normalized : null;
}

/**
 * CLI 가 stderr 에 적는 조건 중 **우리가 아는 것만** 코드로 바꾼다.
 *
 * 원문을 그대로 넘기지 않는 이유: 공급자 산문에는 키·URL·계정 식별자가 섞여
 * 나온다(실측된 usage-limit 메시지에도 결제 URL 이 있다). 아는 조건을 코드로
 * 바꾸면 원인 구분이라는 목적은 달성하면서 원문은 새지 않는다.
 */
const STDERR_CONDITIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/hit your usage limit|usage limit reached|quota exceeded/i, 'LOCAL_CODEX_USAGE_LIMIT'],
  [/rate limit|too many requests/i, 'LOCAL_CODEX_RATE_LIMIT'],
  [/not logged in|please log in|authentication required|unauthorized/i, 'LOCAL_CODEX_NOT_LOGGED_IN'],
  [/unknown model|model not found|unsupported model/i, 'LOCAL_CODEX_UNKNOWN_MODEL'],
];

/** stderr 조각에서 아는 조건을 찾는다. 못 알아보면 `null` — 지어내지 않는다. */
export function classifyCodexStderr(chunk: string): string | null {
  for (const [pattern, code] of STDERR_CONDITIONS) {
    if (pattern.test(chunk)) return code;
  }
  return null;
}

/**
 * 턴 실패 사유를 **경계 지어** 문자열로 만든다.
 *
 * 공급자 응답 전문을 그대로 싣지 않는다(CLAUDE.md: 오류 응답에 공급자 응답
 * 전문·키를 노출하지 않는다). `status` 와 짧은 사유 코드만, 길이를 잘라서 넣는다.
 * 목적은 **할당량 소진·미로그인·모델 거부를 구분**하는 것이지 원문 전달이 아니다.
 */
function turnFailureMessage(turn: Record<string, unknown>, stderrCondition: string | null = null): string {
  const parts = ['LOCAL_CODEX_TURN_FAILED'];
  // stderr 로 알아본 조건이 있으면 그것이 가장 쓸모 있다 — CLI 는 여기에만 적는다.
  if (stderrCondition) parts.push(stderrCondition);
  const status = knownFailureValue(turn.status, TURN_FAILURE_STATUSES);
  if (status) parts.push(`status=${status}`);
  for (const key of ['reason', 'errorCode', 'code', 'failureReason']) {
    const value = turn[key];
    const code = knownFailureValue(value, TURN_FAILURE_CODES);
    if (code) {
      parts.push(`${key}=${code}`);
      break;
    }
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).code ?? (value as Record<string, unknown>).type;
      const nestedCode = knownFailureValue(nested, TURN_FAILURE_CODES);
      if (nestedCode) {
        parts.push(`${key}=${nestedCode}`);
        break;
      }
    }
  }
  return parts.join(' · ');
}

function spawnCodexAppServer(): CodexAppServerProcess {
  if (process.platform === 'win32') {
    return spawn(
      'cmd.exe',
      ['/d', '/s', '/c', 'codex app-server --stdio'],
      { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
  }
  return spawn('codex', ['app-server', '--stdio'], {
    cwd: tmpdir(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export class CodexAppServerClient {
  private readonly child: CodexAppServerProcess;
  private readonly defaultTimeoutMs: number;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private readonly startingTurns = new Set<StartingTurn>();
  private readonly notificationBacklog: RpcResponse[] = [];
  private nextId = 1;
  private stdoutBuffer = '';
  private closed = false;

  constructor(options: CodexAppServerClientOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.child = (options.spawnProcess ?? spawnCodexAppServer)();
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consumeStdout(String(chunk)));
    // stderr 를 흘려버리지 않는다. CLI 는 실패 이유를 여기에 적는데
    // (`You've hit your usage limit …`) `turn/completed` 페이로드에는 `status`
    // 만 온다. 2026-08-07 실측: 68호출이 전부 실패했는데 영수증만으로는 원인을
    // 못 찾아 CLI 를 손으로 두드려서야 할당량 소진임을 알았다.
    //
    // **원문을 싣지는 않는다.** 아는 조건으로 분류만 하고 코드를 낸다 —
    // 공급자 산문에는 키·URL 이 섞여 나올 수 있다(CLAUDE.md).
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => this.consumeStderr(String(chunk)));
    this.child.on('error', () => {
      this.rejectPending('LOCAL_CODEX_EXITED');
      this.rejectActiveTurns('LOCAL_CODEX_EXITED');
    });
    this.child.on('exit', () => {
      this.rejectPending('LOCAL_CODEX_EXITED');
      this.rejectActiveTurns('LOCAL_CODEX_EXITED');
    });
  }

  request<T>(
    method: string,
    params: unknown,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error('LOCAL_CODEX_CLOSED'));
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('LOCAL_CODEX_TIMEOUT'));
      }, options.timeoutMs ?? this.defaultTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  async runTurn(params: LocalTurnParams): Promise<LocalTurnResult> {
    const starting: StartingTurn = { stderrCondition: null };
    this.startingTurns.add(starting);
    let threadStart: { thread: { id: string } };
    let turnStart: { turn: { id: string } };
    try {
      threadStart = await this.request<{ thread: { id: string } }>(
        'thread/start',
        {
          model: params.model,
          ephemeral: true,
          approvalPolicy: 'untrusted',
          permissions: ':read-only',
          cwd: params.cwd,
          developerInstructions: params.developerInstructions,
          dynamicTools: [],
          experimentalRawEvents: false,
        },
        { timeoutMs: params.timeoutMs },
      );
      turnStart = await this.request<{ turn: { id: string } }>(
        'turn/start',
        {
          threadId: threadStart.thread.id,
          input: params.input,
          ...(params.outputSchema === undefined ? {} : { outputSchema: params.outputSchema }),
          ...(params.effort === undefined ? {} : { effort: params.effort }),
        },
        { timeoutMs: params.timeoutMs },
      );
    } catch (error) {
      this.startingTurns.delete(starting);
      throw error;
    }
    this.startingTurns.delete(starting);

    return new Promise<LocalTurnResult>((resolve, reject) => {
      const turnId = turnStart.turn.id;
      const active: ActiveTurn = {
        threadId: threadStart.thread.id,
        turnId,
        model: params.model,
        text: '',
        onDelta: params.onDelta,
        resolve,
        reject,
        timeout: setTimeout(
          () => this.finishTurn(turnId, new Error('LOCAL_CODEX_TIMEOUT')),
          params.timeoutMs ?? this.defaultTimeoutMs,
        ),
        signal: params.signal,
        stderrCondition: starting.stderrCondition,
      };
      if (params.signal) {
        active.abort = () => {
          void this.interruptTurn(active);
          this.finishTurn(turnId, new Error('LOCAL_CODEX_ABORTED'));
        };
        params.signal.addEventListener('abort', active.abort, { once: true });
      }
      this.activeTurns.set(turnId, active);
      this.replayNotifications();
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectPending('LOCAL_CODEX_CLOSED');
    this.rejectActiveTurns('LOCAL_CODEX_CLOSED');
    this.child.kill();
  }

  /**
   * stderr 를 분류만 하고 버린다. 원문은 어디에도 남기지 않는다 —
   * 목적은 "왜 실패했나" 를 가르는 것이지 로그 수집이 아니다.
   */
  private consumeStderr(chunk: string): void {
    const condition = classifyCodexStderr(chunk);
    if (!condition) return;
    const candidates = [...this.activeTurns.values(), ...this.startingTurns.values()];
    if (candidates.length !== 1) return;
    candidates[0].stderrCondition = condition;
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.consumeLine(line);
      newline = this.stdoutBuffer.indexOf('\n');
    }
  }

  private consumeLine(line: string): void {
    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }
    if (typeof message.method === 'string') {
      this.consumeMethodMessage(message);
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error) {
      pending.reject(new Error(message.error.message || 'LOCAL_CODEX_RPC_ERROR'));
      return;
    }
    pending.resolve(message.result);
  }

  private rejectPending(code: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(code));
    }
    this.pending.clear();
  }

  private consumeNotification(message: RpcResponse): void {
    const params = message.params as Record<string, unknown> | undefined;
    const turnId = typeof params?.turnId === 'string'
      ? params.turnId
      : (
          params?.turn
          && typeof params.turn === 'object'
          && typeof (params.turn as Record<string, unknown>).id === 'string'
        )
        ? (params.turn as Record<string, unknown>).id as string
        : null;
    if (!turnId || !this.activeTurns.has(turnId)) {
      if (this.notificationBacklog.length >= 100) this.notificationBacklog.shift();
      this.notificationBacklog.push(message);
      return;
    }
    this.applyTurnNotification(this.activeTurns.get(turnId)!, message);
  }

  private consumeMethodMessage(message: RpcResponse): void {
    if (typeof message.id === 'number') {
      this.consumeServerRequest(message);
      return;
    }
    this.consumeNotification(message);
  }

  private consumeServerRequest(message: RpcResponse): void {
    const params = message.params as Record<string, unknown> | undefined;
    const turnId = typeof params?.turnId === 'string' ? params.turnId : null;
    if (turnId && !this.activeTurns.has(turnId)) {
      if (this.notificationBacklog.length >= 100) this.notificationBacklog.shift();
      this.notificationBacklog.push(message);
      return;
    }
    this.child.stdin.write(`${JSON.stringify({
      id: message.id,
      error: { code: -32000, message: 'LOCAL_CODEX_TOOL_BLOCKED' },
    })}\n`);
    if (!turnId) return;
    const active = this.activeTurns.get(turnId);
    if (!active) return;
    void this.interruptTurn(active);
    this.finishTurn(turnId, new Error('LOCAL_CODEX_TOOL_BLOCKED'));
  }

  private replayNotifications(): void {
    const queued = this.notificationBacklog.splice(0);
    for (const message of queued) this.consumeMethodMessage(message);
  }

  private applyTurnNotification(active: ActiveTurn, message: RpcResponse): void {
    const params = message.params as Record<string, unknown>;
    if (message.method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      active.text += params.delta;
      active.onDelta?.(params.delta);
      return;
    }

    const item = params.item && typeof params.item === 'object'
      ? params.item as Record<string, unknown>
      : null;
    if (
      (message.method === 'item/started' || message.method === 'item/completed')
      && typeof item?.type === 'string'
      && BLOCKED_ITEM_TYPES.has(item.type)
    ) {
      void this.interruptTurn(active);
      this.finishTurn(active.turnId, new Error('LOCAL_CODEX_TOOL_BLOCKED'));
      return;
    }

    if (message.method !== 'turn/completed') return;
    const turn = params.turn as Record<string, unknown>;
    if (turn.status !== 'completed') {
      // 공급자가 말한 사유를 버리지 않는다. 종전에는 `LOCAL_CODEX_TURN_FAILED`
      // 만 남아서 **할당량 소진인지·미로그인인지·모델 거부인지 구분할 수
      // 없었다.** 2026-08-07 실측: 교재형 도면 68호출이 전부 이 오류였는데
      // 영수증만으로는 원인을 못 찾았다. 원장 6차의 스키마 일괄 실패도 같은
      // 형태로 23%·관계 0% 를 냈다 — 성능 수치처럼 보이지만 실행 실패다.
      this.finishTurn(active.turnId, new Error(turnFailureMessage(turn, active.stderrCondition)));
      return;
    }
    if (!active.text) {
      const items = Array.isArray(turn.items) ? turn.items : [];
      const finalMessage = [...items].reverse().find((entry) => (
        entry
        && typeof entry === 'object'
        && (entry as Record<string, unknown>).type === 'agentMessage'
        && typeof (entry as Record<string, unknown>).text === 'string'
      )) as Record<string, unknown> | undefined;
      active.text = typeof finalMessage?.text === 'string' ? finalMessage.text : '';
    }
    this.finishTurn(active.turnId, null, {
      text: active.text,
      model: active.model,
      durationMs: typeof turn.durationMs === 'number' ? turn.durationMs : 0,
    });
  }

  private async interruptTurn(active: ActiveTurn): Promise<void> {
    await this.request(
      'turn/interrupt',
      { threadId: active.threadId, turnId: active.turnId },
      { timeoutMs: 1_000 },
    ).catch(() => undefined);
  }

  private finishTurn(
    turnId: string,
    error: Error | null,
    result?: LocalTurnResult,
  ): void {
    const active = this.activeTurns.get(turnId);
    if (!active) return;
    this.activeTurns.delete(turnId);
    clearTimeout(active.timeout);
    if (active.signal && active.abort) {
      active.signal.removeEventListener('abort', active.abort);
    }
    if (error) {
      active.reject(error);
      return;
    }
    active.resolve(result!);
  }

  private rejectActiveTurns(code: string): void {
    for (const turnId of [...this.activeTurns.keys()]) {
      this.finishTurn(turnId, new Error(code));
    }
  }
}
