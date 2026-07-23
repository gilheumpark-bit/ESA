import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const MOCK_PORT = 11434;
const APP_PORT = 3218;
const root = process.cwd();

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function waitForApp(url, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`ESA server exited early (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('ESA production server did not become ready');
}

function openAiChatChunks() {
  return [
    {
      id: 'chatcmpl-esva',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'mock-chat',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    },
    {
      id: 'chatcmpl-esva',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'mock-chat',
      choices: [{ index: 0, delta: { content: '계산기 영수증을 기준으로 결과를 설명합니다.' }, finish_reason: null }],
    },
    {
      id: 'chatcmpl-esva',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'mock-chat',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  ];
}

let modelRequestPayload;

const mockServer = createServer(async (request, response) => {
  if (request.url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-chat', object: 'model' }] }));
    return;
  }

  if (request.url === '/v1/chat/completions') {
    let requestBody = '';
    for await (const chunk of request) requestBody += String(chunk);
    modelRequestPayload = JSON.parse(requestBody);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const chunk of openAiChatChunks()) response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    response.end('data: [DONE]\n\n');
    return;
  }

  response.writeHead(404);
  response.end();
});

let app;
try {
  await listen(mockServer, MOCK_PORT, 'localhost');
  app = spawn(
    process.execPath,
    [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(APP_PORT)],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );

  let appError = '';
  app.stderr.on('data', (chunk) => { appError += String(chunk); });
  await waitForApp(`http://127.0.0.1:${APP_PORT}`, app);

  const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `http://127.0.0.1:${APP_PORT}`,
      'X-Forwarded-For': '198.51.100.91',
    },
    body: JSON.stringify({
      provider: 'ollama',
      model: 'mock-chat',
      language: 'ko',
      temperature: 0.2,
      maxTokens: 4096,
      messages: [{
        role: 'user',
        content: '전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9',
      }],
    }),
  });
  const body = await response.text();
  const receiptIndex = body.indexOf('"calculation"');
  const answerIndex = body.indexOf('"text"');
  const events = body
    .split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice(6)));
  const calculation = events.find((event) => event.calculation)?.calculation;
  const serializedModelRequest = JSON.stringify(modelRequestPayload);
  const result = {
    status: response.status,
    calculatorReceipt: calculation?.calculatorId === 'voltage-drop',
    calculatorResult:
      calculation?.input?.phase === 3
      && calculation?.input?.voltage === 380
      && calculation?.input?.current === 100
      && calculation?.input?.length === 50
      && calculation?.input?.cableSize === 35
      && calculation?.input?.conductor === 'Cu'
      && calculation?.input?.powerFactor === 0.9
      && calculation?.result?.value === 4.14
      && calculation?.result?.unit === 'V'
      && calculation?.result?.additionalOutputs?.voltageDropPercent?.value === 1.09
      && calculation?.result?.judgment?.pass === true,
    modelReceivedReceipt:
      serializedModelRequest.includes('ESA 계산기 영수증')
      && serializedModelRequest.includes('ESA_CALCULATOR:voltage-drop')
      && serializedModelRequest.includes('\\"value\\":4.14'),
    modelAnswer: body.includes('계산기 영수증을 기준으로 결과를 설명합니다.'),
    receiptBeforeAnswer: receiptIndex >= 0 && answerIndex > receiptIndex,
    calculatedValue: calculation ? `${calculation.result.value}${calculation.result.unit}` : null,
  };

  if (
    !response.ok
    || !result.calculatorReceipt
    || !result.calculatorResult
    || !result.modelReceivedReceipt
    || !result.modelAnswer
    || !result.receiptBeforeAnswer
  ) {
    throw new Error(`Live chat gate failed: ${JSON.stringify(result)} ${appError}`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  if (app && app.exitCode === null) {
    app.kill();
    await new Promise((resolve) => app.once('exit', resolve));
  }
  await close(mockServer);
}
