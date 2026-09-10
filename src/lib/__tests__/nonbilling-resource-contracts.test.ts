import { FeatureRequestError, requestFeatureJson, unwrapFeatureResponse, requireRecord, retryDelay, relativeActivityTime } from '../feature-request';
import { decodeProjects, decodeCommunity, decodeDashboard } from '../feature-read-models';
import { safeFeatureLink, featureCsv, featureCsvCell } from '../feature-output';
import { createSingleFlightResource } from '../single-flight-resource';

const transport = (response: () => Promise<Response>) => jest.fn<Promise<Response>, Parameters<typeof fetch>>(response);
const project = { id: 'p1', name: 'Project', status: 'active', updatedAt: '2026-09-10T00:00:00Z', memberCount: 1, calculationCount: 0, userRole: 'owner' };

describe('feature requests never report failed/malformed data as an empty success', () => {
  it('decodes a valid response once without automatically retrying mutations', async () => {
    const fetcher = transport(async () => Response.json({ data: 5 }));
    expect(await requestFeatureJson('/api/projects', { method: 'POST' }, requireRecord, fetcher)).toEqual({ data: 5 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 409, 429, 500, 503])('rejects HTTP %d and retains bounded retry metadata', async (status) => {
    const fetcher = transport(async () => Response.json({ error: { message: '확인된 오류' } }, { status, headers: { 'Retry-After': '5' } }));
    await expect(requestFeatureJson('/api/projects', {}, requireRecord, fetcher)).rejects.toMatchObject({ status, retryAfterSeconds: 5, message: '확인된 오류' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a business failure returned with HTTP 200', async () => {
    await expect(requestFeatureJson('/api/projects', {}, requireRecord, transport(async () => Response.json({ success: false })))).rejects.toBeInstanceOf(FeatureRequestError);
  });
  it('fails after the body timeout even when a noncooperating transport never returns', async () => {
    await expect(requestFeatureJson('/api/projects', {}, requireRecord, transport(() => new Promise(() => undefined)), 10)).rejects.toThrow('지연');
  });
  it('honors cancellation before token or transport work', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = transport(async () => Response.json({ ok: true }));
    await expect(requestFeatureJson('/api/projects', { signal: controller.signal }, requireRecord, fetcher)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not turn a truncated body or invalid JSON into empty data', async () => {
    await expect(requestFeatureJson('/api/projects', {}, requireRecord, transport(async () => new Response('<html>offline</html>')))).rejects.toThrow('응답');
  });
  it.each(['https://external.test/api', '//external.test/api', '/other', '/api/\\evil', '/api/\nsecret'])('rejects a credential-forwarding target %p', async (url) => {
    const fetcher = transport(async () => Response.json({}));
    await expect(requestFeatureJson(url, {}, requireRecord, fetcher)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('unwraps supported envelope variants but rejects absent records', () => {
    expect(unwrapFeatureResponse({ success: true, data: { x: 1 } })).toEqual({ x: 1 });
    expect(unwrapFeatureResponse({ projects: [] })).toEqual({ projects: [] });
    for (const value of [null, [], false, { success: false }]) expect(() => unwrapFeatureResponse(value)).toThrow();
  });
  it('handles Retry-After seconds/date safely', () => {
    expect(retryDelay('5', 0)).toBe(5); expect(retryDelay('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60);
    expect(retryDelay('99999')).toBe(3600); expect(retryDelay('invalid')).toBeUndefined();
  });
});

describe('validated non-billing view models', () => {
  it('accepts explicit empty lists and rejects missing ones', () => {
    expect(decodeProjects({ projects: [] })).toEqual([]);
    expect(() => decodeProjects({})).toThrow();
    expect(decodeProjects({ projects: [project] })).toHaveLength(1);
  });
  it.each([{ userRole: 'admin' }, { name: null }, { memberCount: -1 }, { calculationCount: NaN }])('rejects malformed project fields %p', (patch) => {
    expect(() => decodeProjects({ projects: [{ ...project, ...patch }] })).toThrow();
  });
  it('keeps explicit negative votes but rejects nonnumeric counts', () => {
    const row = { id: 'q', title: '질문', tags: ['KEC'], votes: -1, answerCount: 0, status: 'open', createdAt: '' };
    expect(decodeCommunity({ success: true, data: { data: [row], totalPages: 1 } }).data[0].votes).toBe(-1);
    expect(() => decodeCommunity({ success: true, data: { data: [{ ...row, answerCount: '0' }], totalPages: 1 } })).toThrow();
  });
  it('retains partial dashboard warnings rather than inventing zero meaning', () => {
    expect(decodeDashboard({ success: true, data: { totalCalcs: 2000, calcUsage: [], recentCalcs: [], standardUpdates: [], usageComplete: false }, warnings: ['standard_updates_unavailable'] }))
      .toMatchObject({ totalCalcs: 2000, usageComplete: false, warnings: ['standard_updates_unavailable'] });
    expect(() => decodeDashboard({ success: true, data: {} })).toThrow();
  });
  it('does not show malformed activity dates as now', () => {
    expect(relativeActivityTime('broken', 0)).toBe('기록 시각 미확인');
    expect(relativeActivityTime('1970-01-01T00:02:00Z', 0)).toContain('미래');
  });
});

describe('export and link boundaries', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', '//example.test', '/\\example', 'https://user:password@example.test', ' https://example.test'])('removes unsafe link %p', (link) => {
    expect(safeFeatureLink(link)).toBeUndefined();
  });
  it('keeps internal and normal source URLs', () => {
    expect(safeFeatureLink('/projects/a?q=1')).toBe('/projects/a?q=1'); expect(safeFeatureLink('https://example.test/a')).toBe('https://example.test/a');
  });
  it.each(['=HYPERLINK("x")', ' +SUM(1)', '@cmd', '-cmd', '\ttext'])('neutralizes spreadsheet expressions %p', (value) => {
    expect(featureCsvCell(value).startsWith('"\'')).toBe(true);
  });
  it('quotes delimiters and preserves Unicode', () => {
    expect(featureCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(featureCsv(['항목'], [['자료\n두 번째 행']])).toBe('\uFEFF"항목"\r\n"자료\n두 번째 행"\r\n');
  });
});

describe('resource connection lifecycle', () => {
  it('coalesces simultaneous connection attempts', async () => {
    const candidate = {}, connect = jest.fn(async () => candidate), close = jest.fn();
    const resource = createSingleFlightResource({ connect, ready: async () => true, close });
    const results = await Promise.all([resource.get(), resource.get(), resource.get()]);
    expect(connect).toHaveBeenCalledTimes(1); expect(results).toEqual([candidate, candidate, candidate]);
    resource.reset(); expect(close).toHaveBeenCalledWith(candidate);
  });
  it('a reset closes an old pending connection without adopting it', async () => {
    let release!: (value: { id: number }) => void; const close = jest.fn();
    const connect = jest.fn<Promise<{ id: number }>, []>().mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue({ id: 2 });
    const resource = createSingleFlightResource({ connect, ready: async () => true, close });
    const old = resource.get(); resource.reset(); const current = await resource.get(); release({ id: 1 });
    expect(await old).toBeNull(); expect(current).toEqual({ id: 2 }); expect(await resource.get()).toEqual({ id: 2 });
    expect(close).toHaveBeenCalledWith({ id: 1 });
  });
  it('unavailable candidates close and retry after cooldown', async () => {
    let now = 0; const close = jest.fn(), connect = jest.fn(async () => ({}));
    const resource = createSingleFlightResource({ connect, ready: async () => false, close, now: () => now, cooldownMs: 50 });
    expect(await resource.get()).toBeNull(); expect(await resource.get()).toBeNull(); expect(connect).toHaveBeenCalledTimes(1);
    now = 51; await resource.get(); expect(connect).toHaveBeenCalledTimes(2); expect(close).toHaveBeenCalledTimes(2);
  });
});
