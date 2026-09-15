/** Tests actual production modules with mock stdio; never starts an AI process. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const build = mkdtempSync(path.join(tmpdir(), 'esa-rpc-'));
after(() => rmSync(build, { recursive: true, force: true }));
for (const name of ['chatgpt-local-rpc', 'chatgpt-local-protocol']) {
  const file = new URL(`../../src/lib/${name}.ts`, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file.pathname,
    reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal((compiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  writeFileSync(path.join(build, `${name}.js`), compiled.outputText);
}
const require = createRequire(import.meta.url);
const { CodexAppServerClient } = require(path.join(build, 'chatgpt-local-protocol.js'));
const { LOCAL_RPC_LIMITS } = require(path.join(build, 'chatgpt-local-rpc.js'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
class FakeProcess extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  requests = []; killed = false;
  constructor() {
    super();
    this.stdin.on('data', (chunk) => {
      for (const line of String(chunk).trim().split('\n')) {
        const request = JSON.parse(line); this.requests.push(request);
        if (request.method === 'turn/interrupt') this.send({ id: request.id, result: {} });
      }
    });
  }
  kill() { this.killed = true; this.emit('exit', 0, null); return true; }
  send(value) { this.stdout.write(`${JSON.stringify(value)}\n`); }
}
const params = { model: 'test-model', developerInstructions: 'Extract only.',
  input: [{ type: 'text', text: 'synthetic' }], cwd: '/tmp' };
function setup(t) {
  const child = new FakeProcess();
  const client = new CodexAppServerClient({ spawnProcess: () => child, defaultTimeoutMs: 1000 });
  t.after(() => client.close());
  return { child, client };
}
function pending(client) { return client.request('test/read', {}).then((value) => ({ value }), (error) => ({ error: error.message })); }
async function active(ctx, options = {}) {
  const result = ctx.client.runTurn({ ...params, ...options }).then((value) => ({ value }), (error) => ({ error: error.message }));
  ctx.child.send({ id: ctx.child.requests.at(-1).id, result: { thread: { id: 'thread-1' } } });
  await tick();
  ctx.child.send({ id: ctx.child.requests.at(-1).id, result: { turn: { id: 'turn-1' } } });
  await tick(); return { result };
}
function completed(child, overrides = {}) {
  child.send({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed', items: [], ...overrides } } });
}

for (const raw of ['null', '[]', 'true', '42', '"private-string"', '{broken', '{}', '{"id":1}', '{"id":1,"result":{},"error":{}}']) {
  test(`malformed top-level frame is a controlled terminal error: ${raw}`, async (t) => {
    const { child, client } = setup(t); const result = pending(client);
    assert.doesNotThrow(() => child.stdout.write(`${raw}\n`));
    assert.deepEqual(await result, { error: 'LOCAL_CODEX_INVALID_RESPONSE' });
    assert.equal(child.killed, true); assert.equal(client.pending.size, 0);
    assert.equal(client.stdoutBuffer, ''); assert.equal(client.backlogBytes, 0);
  });
}
for (const newline of ['', '\n']) test(`oversized frame is rejected before retention (${newline ? 'complete' : 'unterminated'})`, async (t) => {
  const { child, client } = setup(t); const result = pending(client);
  child.stdout.write('x'.repeat(LOCAL_RPC_LIMITS.frameBytes + 1) + newline);
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_FRAME_LIMIT' }); assert.equal(client.stdoutBuffer, '');
});
test('UTF-8 bytes, not JS code units, bound an unfinished frame', async (t) => {
  const { child, client } = setup(t); const result = pending(client);
  const chunk = '한'.repeat(1000);
  for (let i = 0; i < 400; i++) child.stdout.write(chunk);
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_FRAME_LIMIT' }); assert.equal(client.stdoutBytes, 0);
});
test('multiple complete frames in a large chunk are counted separately', async (t) => {
  const { child, client } = setup(t); const result = pending(client);
  const unknown = JSON.stringify({ method: 'future/event', params: { note: 'x'.repeat(32000) } }) + '\n';
  child.stdout.write(unknown.repeat(40) + JSON.stringify({ id: child.requests[0].id, result: { ok: true } }) + '\n');
  assert.deepEqual(await result, { value: { ok: true } }); assert.equal(child.killed, false);
});
test('split UTF-8 network bytes preserve the exact output', async (t) => {
  const ctx = setup(t); const deltas = []; const { result } = await active(ctx, { onDelta: (text) => deltas.push(text) });
  const bytes = Buffer.from(JSON.stringify({ method: 'item/agentMessage/delta', params: { turnId: 'turn-1', delta: '한글🙂' } }) + '\n');
  for (const byte of bytes) ctx.child.stdout.write(Buffer.from([byte])); completed(ctx.child);
  assert.equal((await result).value.text, '한글🙂'); assert.deepEqual(deltas, ['한글🙂']);
});
test('unowned and late notifications never accumulate with no startup race', (t) => {
  const { child, client } = setup(t);
  for (let i = 0; i < 110; i++) child.send({ method: 'item/agentMessage/delta', params: { turnId: `unknown-${i}`, delta: 'x'.repeat(32768) } });
  assert.equal(client.notificationBacklog.length, 0); assert.equal(client.backlogBytes, 0); assert.equal(child.killed, false);
});
for (const [name, count, size] of [['bytes', 40, 32768], ['count', 101, 1]]) test(`startup backlog ${name} overflow rejects rather than evicting evidence`, async (t) => {
  const { child, client } = setup(t);
  const result = client.runTurn(params).catch((error) => error.message);
  for (let i = 0; i < count; i++) child.send({ method: 'item/agentMessage/delta', params: { turnId: `pending-${i}`, delta: 'x'.repeat(size) } });
  assert.equal(await result, 'LOCAL_CODEX_BACKLOG_LIMIT'); assert.equal(client.backlogBytes, 0);
  assert.equal(client.notificationBacklog.length, 0); assert.equal(client.startingTurns.size, 0);
});
test('completion arriving before turn/start continuation is replayed exactly once', async (t) => {
  const { child, client } = setup(t); const result = client.runTurn(params);
  child.send({ id: child.requests[0].id, result: { thread: { id: 'thread-1' } } }); await tick();
  child.send({ id: child.requests[1].id, result: { turn: { id: 'turn-1' } } });
  completed(child, { items: [{ type: 'agentMessage', text: 'early' }] });
  assert.equal((await result).text, 'early'); assert.equal(client.notificationBacklog.length, 0); assert.equal(client.backlogBytes, 0);
});
for (const reply of [null, [], {}, { thread: null }, { thread: { id: '' } }, { thread: { id: 3 } }]) test(`valid JSON with invalid startup shape is rejected: ${JSON.stringify(reply)}`, async (t) => {
  const { child, client } = setup(t); const result = client.runTurn(params).catch((error) => error.message);
  child.send({ id: child.requests[0].id, result: reply });
  assert.equal(await result, 'LOCAL_CODEX_INVALID_RESPONSE'); assert.equal(child.requests.length, 1); assert.equal(child.killed, true);
});
for (const badParams of [null, [], { turnId: 'turn-1' }, { turn: null }, { turn: { id: 'turn-1', status: 'completed', items: {} } }]) test(`invalid terminal payload cannot throw or imply success: ${JSON.stringify(badParams)}`, async (t) => {
  const ctx = setup(t); const { result } = await active(ctx);
  assert.doesNotThrow(() => ctx.child.send({ method: 'turn/completed', params: badParams }));
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_INVALID_RESPONSE' }); assert.equal(ctx.client.activeTurns.size, 0);
});
test('mismatched thread ownership is not delivered', async (t) => {
  const ctx = setup(t); const { result } = await active(ctx);
  ctx.child.send({ method: 'item/agentMessage/delta', params: { threadId: 'another-thread', turnId: 'turn-1', delta: 'wrong' } });
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_INVALID_RESPONSE' });
});
test('provider RPC error prose is redacted', async (t) => {
  const { child, client } = setup(t); const result = pending(client);
  child.send({ id: child.requests[0].id, error: { code: -1, message: 'private /home/user/key TOKEN-TEST' } });
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_RPC_ERROR' });
});
test('known RPC quota errors remain classified without exposing prose', async (t) => {
  const { child, client } = setup(t); const result = pending(client);
  child.send({ id: child.requests[0].id, error: { code: -1, message: 'quota exceeded private-account-token' } });
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_USAGE_LIMIT' });
});
test('blocked tool present only in terminal items still prevents successful output', async (t) => {
  const ctx = setup(t); const { result } = await active(ctx);
  completed(ctx.child, { items: [{ type: 'commandExecution' }, { type: 'agentMessage', text: 'not allowed' }] });
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_TOOL_BLOCKED' });
});
test('string-id server approvals are denied, never treated as harmless notifications', async (t) => {
  const ctx = setup(t); const { result } = await active(ctx);
  ctx.child.send({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { turnId: 'turn-1' } });
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_TOOL_BLOCKED' });
  assert.ok(ctx.child.requests.some((message) => message.id === 'approval-1' && message.error?.message === 'LOCAL_CODEX_TOOL_BLOCKED'));
});
test('a throwing consumer callback rejects the turn without an uncaught exception', async (t) => {
  const ctx = setup(t); const { result } = await active(ctx, { onDelta: () => { throw new Error('private'); } });
  assert.doesNotThrow(() => ctx.child.send({ method: 'item/agentMessage/delta', params: { turnId: 'turn-1', delta: 'test' } }));
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_DELIVERY_FAILED' });
});
for (const event of ['exit', 'write-error']) test(`dead transport blocks new requests and clears resources: ${event}`, async (t) => {
  const { child, client } = setup(t); const first = pending(client);
  if (event === 'exit') child.emit('exit', 1, null); else child.stdin.emit('error', new Error('private pipe details'));
  assert.deepEqual(await first, { error: event === 'exit' ? 'LOCAL_CODEX_EXITED' : 'LOCAL_CODEX_WRITE_FAILED' });
  assert.deepEqual(await pending(client), { error: 'LOCAL_CODEX_CLOSED' }); assert.equal(client.pending.size, 0);
});
test('exit between turn response and continuation cannot register a zombie turn', async (t) => {
  const { child, client } = setup(t); const result = client.runTurn(params).catch((error) => error.message);
  child.send({ id: child.requests[0].id, result: { thread: { id: 'thread-1' } } }); await tick();
  child.send({ id: child.requests[1].id, result: { turn: { id: 'turn-1' } } }); child.emit('exit', 1, null);
  assert.equal(await result, 'LOCAL_CODEX_CLOSED'); assert.equal(client.activeTurns.size, 0);
});


test('standard turns also have a transport-wide output ceiling', async (t) => {
  const ctx = setup(t); const { result } = await active(ctx);
  const delta = 'x'.repeat(256 * 1024);
  for (let i = 0; i < 33; i++) ctx.child.send({ method: 'item/agentMessage/delta', params: { turnId: 'turn-1', delta } });
  assert.deepEqual(await result, { error: 'LOCAL_CODEX_OUTPUT_LIMIT' });
});
