import { NextRequest } from 'next/server';
import { runOrchestrator } from '@/agent/orchestrator';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { saveReport } from '@/lib/report-store';
import { POST } from '../route';

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
    expect(mockSaveReport).toHaveBeenCalledWith(report, 'firebase-user-a');
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
