import { NextRequest } from 'next/server';
import { POST, classifyProviderFailure } from '@/app/api/sld/route';
import { analyzeSLD, generateCalcChainFromSLD, type SLDAnalysis } from '@/lib/sld-recognition';
import { analyzeSLDWithLunaFastPath } from '@/lib/sld-luna-fast-path';
import { resolveDrawingVisionRequest } from '@/lib/drawing-vision-request';
import { measureTextQuality, type TextQualityResult } from '@/lib/drawing-text-quality';
import { buildTopologyFromSLD } from '@/engine/topology';
import { reviewAnalysis } from '@/engine/review/circuit-review';
import { deriveConstraints } from '@/engine/review/cross-constraint';

jest.mock('@/lib/sld-recognition', () => ({ analyzeSLD: jest.fn(), generateCalcChainFromSLD: jest.fn(() => []) }));
jest.mock('@/lib/sld-luna-fast-path', () => ({
  ...jest.requireActual('@/lib/sld-luna-fast-path'), analyzeSLDWithLunaFastPath: jest.fn(),
}));
jest.mock('@/lib/drawing-vision-request', () => ({ resolveDrawingVisionRequest: jest.fn(), DrawingVisionRequestError: class extends Error {} }));
jest.mock('@/engine/topology', () => ({ buildTopologyFromSLD: jest.fn() }));
jest.mock('@/engine/review/circuit-review', () => ({ reviewAnalysis: jest.fn(() => ({})) }));
jest.mock('@/engine/review/cross-constraint', () => {
  const actual = jest.requireActual<typeof import('@/engine/review/cross-constraint')>('@/engine/review/cross-constraint');
  return { ...actual, deriveConstraints: jest.fn(actual.deriveConstraints) };
});
jest.mock('@/lib/drawing-text-quality', () => ({ measureTextQuality: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/lib/api-logger', () => ({ apiLog: jest.fn(), createRequestTimer: () => ({ elapsed: () => 1 }) }));

const fast = analyzeSLDWithLunaFastPath as jest.MockedFunction<typeof analyzeSLDWithLunaFastPath>;
const standard = analyzeSLD as jest.MockedFunction<typeof analyzeSLD>;
const vision = resolveDrawingVisionRequest as jest.MockedFunction<typeof resolveDrawingVisionRequest>;
const quality = jest.mocked(measureTextQuality);
const priorFlag = process.env.ESVA_LUNA_SLD_FAST_PATH;
const poorQuality: TextQualityResult = {
  grade: 'poor', strokeSharpness: 56.8, glyphHeightMedian: 9, glyphCount: 24,
  reason: '합성 품질 경고: 스펙 수치를 이 결과로 확정하지 마십시오.',
};
const analysis = {
  components: [{ id: 'q1', type: 'breaker' as const, position: { x: 20, y: 30 }, label: 'Q1' }],
  connections: [], confidence: 0.99, rawDescription: 'Unverified fixture',
  suggestedCalculations: [{ calculatorId: 'breaker-sizing', inputs: {}, reason: 'untrusted model suggestion', priority: 1 }],
};
function request(): NextRequest {
  const form = new FormData();
  form.append('image', new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'fixture.png');
  return new NextRequest('http://localhost/api/sld', { method: 'POST', body: form });
}

describe('Luna API extraction boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ESVA_LUNA_SLD_FAST_PATH;
    vision.mockResolvedValue({ provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'test-key', effort: 'high' });
    fast.mockResolvedValue(analysis);
    standard.mockResolvedValue(analysis);
    quality.mockResolvedValue(poorQuality);
    (buildTopologyFromSLD as jest.Mock).mockReturnValue({ validate: () => ({
      valid: true, issues: [], stats: { nodeCount: 1, edgeCount: 0, isolatedNodes: 1, connectedComponents: 1 },
    }) });
  });
  afterAll(() => {
    if (priorFlag === undefined) delete process.env.ESVA_LUNA_SLD_FAST_PATH;
    else process.env.ESVA_LUNA_SLD_FAST_PATH = priorFlag;
  });

  it('keeps experimental routing off by default and preserves the standard path', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(standard).toHaveBeenCalledTimes(1);
    expect(fast).not.toHaveBeenCalled();
    expect(generateCalcChainFromSLD).toHaveBeenCalledTimes(1);
    expect(reviewAnalysis).toHaveBeenCalledTimes(1);
  });

  it('propagates effort and cancellation while blocking all automatic engineering consumers', async () => {
    process.env.ESVA_LUNA_SLD_FAST_PATH = 'true';
    const req = request();
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(fast).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ effort: 'high', signal: req.signal }));
    expect(standard).not.toHaveBeenCalled();
    expect(generateCalcChainFromSLD).not.toHaveBeenCalled();
    expect(reviewAnalysis).not.toHaveBeenCalled();
    expect(deriveConstraints).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({ analysisMode: 'luna-extraction-only', requiresReview: true, calcChain: [], constraints: [], review: { skipped: true }, data: { suggestedCalculations: [] } });
    expect(body.data.warnings).toContain('LUNA_FAST_PATH_REDUCED_SCOPE');
    expect(body.readout.completeness).toBe('not-verified');
  });

  it('does not divert Terra even when the Luna rollout flag is enabled', async () => {
    process.env.ESVA_LUNA_SLD_FAST_PATH = 'true';
    vision.mockResolvedValue({ provider: 'openai', model: 'gpt-5.6-terra', apiKey: 'test-key' });
    expect((await POST(request())).status).toBe(200);
    expect(standard).toHaveBeenCalledTimes(1);
    expect(fast).not.toHaveBeenCalled();
  });

  it('enforces reduced scope even when it is returned through another analysis path', async () => {
    standard.mockResolvedValue({ ...analysis, warnings: ['LUNA_FAST_PATH_REDUCED_SCOPE'] });
    const body = await (await POST(request())).json();
    expect(body.data.suggestedCalculations).toEqual([]);
    expect(body.review.skipped).toBe(true);
    expect(generateCalcChainFromSLD).not.toHaveBeenCalled();
    expect(reviewAnalysis).not.toHaveBeenCalled();
    expect(deriveConstraints).not.toHaveBeenCalled();
  });

  it.each([0.2, 0.99])('returns real standard-path constraints despite poor text quality at confidence %p', async (confidence) => {
    // The provider is synthetic; the route and constraint engine are real.
    // The inconsistent 300kVA / 2000A pair must not disappear at low confidence.
    const input: SLDAnalysis = {
      ...analysis, confidence, suggestedCalculations: [],
      components: [
        { id: 'tr1', type: 'transformer', label: 'TR-1', rating: '300kVA', position: { x: 20, y: 20 } },
        { id: 'acb1', type: 'breaker', label: 'ACB-1', rating: '2000A', voltage: '380V', position: { x: 20, y: 40 } },
      ],
    };
    standard.mockResolvedValue(input);
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(deriveConstraints).toHaveBeenCalledTimes(1);
    expect(deriveConstraints).toHaveBeenCalledWith(input.components);
    expect(body.constraints).toHaveLength(1);
    expect(body.constraints[0].consistent).toBe(false);
    expect(body.constraints[0].basis).toContain('2000');
    expect(body.textQuality).toEqual(poorQuality);
    expect(fast).not.toHaveBeenCalled();
  });

  it.each(['standard', 'luna'] as const)('preserves text-quality warnings in the %s response and measures before the provider call', async (path) => {
    if (path === 'luna') process.env.ESVA_LUNA_SLD_FAST_PATH = 'true';
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.textQuality).toEqual(poorQuality);
    expect(body.data.components).toEqual(analysis.components);
    const selected = path === 'luna' ? fast : standard;
    expect(selected).toHaveBeenCalledTimes(1);
    expect(quality).toHaveBeenCalledTimes(1);
    expect(quality).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(quality.mock.invocationCallOrder[0]).toBeLessThan(selected.mock.invocationCallOrder[0]);
  });

  it('returns a classified failure rather than success for unusable reads', async () => {
    process.env.ESVA_LUNA_SLD_FAST_PATH = 'true';
    fast.mockRejectedValue(new Error('[ESA-SLD] LUNA_EMPTY_RESULT'));
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'LUNA_EMPTY_RESULT' });
    expect(buildTopologyFromSLD).not.toHaveBeenCalled();
    expect(generateCalcChainFromSLD).not.toHaveBeenCalled();
  });

  it('does not expose saga metadata or provider diagnostic prose', async () => {
    process.env.ESVA_LUNA_SLD_FAST_PATH = 'true';
    fast.mockRejectedValue(new Error('saga=private failedStep=private steps status database password'));
    const response = await POST(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['code', 'error']);
    expect(JSON.stringify(body)).not.toMatch(/database password|saga|failedStep|\bsteps\b|\bstatus\b/i);
    expect(body.error).toBe(classifyProviderFailure('unclassified').message);
  });
});
