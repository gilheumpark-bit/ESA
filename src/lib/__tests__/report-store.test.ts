import { hashCanonicalValue } from '@/engine/receipt/receipt-hash';
import type { ESVAVerifiedReport } from '@/agent/teams/types';
import { loadReport, saveReport } from '@/lib/report-store';

const fetchMock = jest.fn();

async function makeReport(): Promise<ESVAVerifiedReport> {
  const claim: Omit<ESVAVerifiedReport, 'hash'> = {
    reportId: 'RPT-OWNED-1',
    createdAt: '2026-07-20T00:00:00.000Z',
    version: 'ESVA Report v1.0',
    projectName: 'Owned report',
    projectType: 'SLD',
    verdict: 'PASS',
    grade: 'A',
    compositeScore: 90,
    teamResults: [],
    debateResults: [],
    markings: [],
    summary: {
      totalComponents: 0,
      totalConnections: 0,
      totalCalculations: 0,
      passedChecks: 0,
      failedChecks: 0,
      warningChecks: 0,
      criticalViolations: [],
      topRecommendations: [],
      appliedStandards: [],
      textKo: '',
      textEn: '',
    },
    evidenceIds: [],
  };
  return { ...claim, hash: await hashCanonicalValue(claim) };
}

describe('report store ownership and integrity', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-secret';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon';
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  test('loads only a report owned by the authenticated Firebase user', async () => {
    const report = await makeReport();
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ report_json: report }]), { status: 200 }));
    const ownedLoad = loadReport as unknown as (
      reportId: string,
      userId: string,
    ) => Promise<ESVAVerifiedReport | null>;

    await expect(ownedLoad(report.reportId, 'firebase-user-a')).resolves.toEqual(report);
    expect(fetchMock.mock.calls[0][0]).toContain('user_id=eq.firebase-user-a');
  });

  test('rejects a stored report whose integrity hash does not match', async () => {
    const report = { ...(await makeReport()), projectName: 'tampered' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ report_json: report }]), { status: 200 }));
    const ownedLoad = loadReport as unknown as (
      reportId: string,
      userId: string,
    ) => Promise<ESVAVerifiedReport | null>;

    await expect(ownedLoad(report.reportId, 'firebase-user-a')).resolves.toBeNull();
  });

  test('never falls back to the public anon key for privileged report writes', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await expect(saveReport(await makeReport(), 'firebase-user-a')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('forwards the caller signal to the in-flight write and reports false when it aborts', async () => {
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      expect(init.signal).toBe(controller.signal);
      release?.();
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));

    const pending = saveReport(await makeReport(), 'firebase-user-a', { signal: controller.signal });
    await writeStarted;
    controller.abort();

    await expect(pending).resolves.toBe(false);
  });
});
