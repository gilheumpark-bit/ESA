import { NextRequest } from 'next/server';
import { runOrchestrator } from '@/agent/orchestrator';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { saveReport } from '@/lib/report-store';
import { POST, createRequestSignal, maxDuration } from '../route';

jest.mock('@/agent/orchestrator', () => ({ runOrchestrator: jest.fn() }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/report-store', () => ({ saveReport: jest.fn() }));

const mockRunOrchestrator = jest.mocked(runOrchestrator);
const mockExtractUser = jest.mocked(extractVerifiedUserId);
const mockSaveReport = jest.mocked(saveReport);

const report = {
  reportId: 'RPT-PERSIST-1',
  verdict: 'PASS',
  grade: 'A',
  compositeScore: 90,
  markings: [],
  summary: {},
  debateResults: [],
  hash: 'a'.repeat(64),
};

describe('POST /api/team-review report persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractUser.mockResolvedValue('firebase-user-a');
    mockSaveReport.mockResolvedValue(true);
    mockRunOrchestrator.mockResolvedValue({
      success: true,
      routing: {
        primaryTeam: 'TEAM-SLD',
        supportTeams: ['TEAM-STD'],
        classification: 'sld_image',
        requiresConsensus: true,
      },
      consensus: {
        requested: true,
        executed: true,
        participatingTeams: ['TEAM-SLD', 'TEAM-STD'],
      },
      teamResults: [],
      report: report as never,
      durationMs: 1,
    });
  });

  test('declares the 300 second runtime budget', () => {
    expect(maxDuration).toBe(300);
  });

  test('immediately propagates an already-aborted request signal', () => {
    const controller = new AbortController();
    controller.abort();
    const scope = createRequestSignal(controller.signal);

    expect(scope.signal.aborted).toBe(true);
    scope.dispose();
  });

  test('returns the fixed 504 without persistence when the 270 second request deadline aborts', async () => {
    jest.useFakeTimers();
    const secret = 'server-key-must-not-appear';
    mockRunOrchestrator.mockImplementationOnce(({ signal }) => new Promise((resolve) => {
      signal?.addEventListener('abort', () => resolve({
        success: false,
        routing: { primaryTeam: 'TEAM-SLD', supportTeams: [], classification: 'sld_image', requiresConsensus: false },
        consensus: { requested: false, executed: false, participatingTeams: [] },
        teamResults: [],
        durationMs: 0,
        error: secret,
      }), { once: true });
    }));
    const req = new NextRequest('http://localhost:3000/api/team-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', 'X-Forwarded-For': '198.51.100.79' },
      body: JSON.stringify({ query: 'deadline' }),
    });
    const responsePromise = POST(req);
    await jest.advanceTimersByTimeAsync(270_000);
    const response = await responsePromise;
    const body = await response.json();
    jest.useRealTimers();

    expect(response.status).toBe(504);
    expect(mockSaveReport).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  test('does not persist a report after the client disconnects', async () => {
    const controller = new AbortController();
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    mockRunOrchestrator.mockImplementationOnce(({ signal }) => new Promise((resolve) => {
      started?.();
      signal?.addEventListener('abort', () => resolve({
        success: true,
        routing: { primaryTeam: 'TEAM-SLD', supportTeams: [], classification: 'sld_image', requiresConsensus: false },
        consensus: { requested: false, executed: false, participatingTeams: [] },
        teamResults: [],
        report: report as never,
        durationMs: 0,
      }), { once: true });
    }));
    const req = new NextRequest('http://localhost:3000/api/team-review', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', 'X-Forwarded-For': '198.51.100.80' },
      body: JSON.stringify({ query: 'disconnect' }),
    });
    const responsePromise = POST(req);
    await startedPromise;
    controller.abort();
    const response = await responsePromise;

    expect(response.status).toBe(499);
    expect(mockSaveReport).not.toHaveBeenCalled();
  });

  test('aborts an already-started report write with the same request-scoped signal', async () => {
    const controller = new AbortController();
    let started: (() => void) | undefined;
    const startedWrite = new Promise<void>((resolve) => { started = resolve; });
    mockSaveReport.mockImplementationOnce((_report, _userId, options) => new Promise((resolve) => {
      started?.();
      if (!options?.signal) { resolve(false); return; }
      options?.signal?.addEventListener('abort', () => resolve(false), { once: true });
    }));
    const req = new NextRequest('http://localhost:3000/api/team-review', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', 'X-Forwarded-For': '198.51.100.81' },
      body: JSON.stringify({ query: 'write abort' }),
    });
    const responsePromise = POST(req);
    await startedWrite;
    const orchestratorSignal = mockRunOrchestrator.mock.calls[0][0].signal;
    const persistenceSignal = mockSaveReport.mock.calls[0][2]?.signal;
    controller.abort();
    const response = await responsePromise;

    expect(persistenceSignal).toBe(orchestratorSignal);
    expect(response.status).toBe(499);
  });

  test('persists an authenticated report and discloses the persistence result', async () => {
    const req = new NextRequest('http://localhost:3000/api/team-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        Authorization: 'Bearer verified-token',
        'X-Forwarded-For': '198.51.100.77',
      },
      body: JSON.stringify({ query: '계통도 검토', sessionId: 'persist-test' }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSaveReport).toHaveBeenCalledWith(report, 'firebase-user-a', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(body.data.persistence).toEqual({ attempted: true, saved: true });
  });

  test('forwards an image BYOK key only through the in-memory team input', async () => {
    const secret = ['sk', 'ant', 'request', 'only', 'secret', 'value'].join('-');
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'drawing.png', { type: 'image/png' }));
    formData.append('provider', 'claude');
    formData.append('apiKey', secret);
    formData.append('projectName', 'BYOK drawing');

    const req = new NextRequest('http://localhost:3000/api/team-review', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Authorization: 'Bearer verified-token',
        'X-Forwarded-For': '198.51.100.78',
      },
      body: formData,
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRunOrchestrator).toHaveBeenCalledWith(expect.objectContaining({
      vision: { provider: 'claude', apiKey: secret },
    }));
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});
