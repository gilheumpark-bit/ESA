import sharp from 'sharp';
import { runDocumentAnalysis } from '../document-orchestrator';
import { _resetJobsForTests, createJob, getJob } from '../drawing-job-store';
import type { PreparedDrawingPage, PreparedDrawingSource } from '../drawing-source';

/**
 * 쓴 AI 호출을 **쓴 즉시** 적는지 본다.
 *
 * 문서 호출 예산(`maxVlmCalls`)은 실행마다 새로 주어지지만, 오케스트레이터가
 * 저장된 `vlmCallsUsed` 에서 출발해 누적으로 검사하므로 문서 단위 상한으로
 * 동작한다 — 거기까지는 옳다.
 *
 * 문제는 저장 시점이었다. `runDocumentAnalysis` 에는 try/catch 가 하나도
 * 없고 `vlmCallsUsed` 를 페이지 분석이 다 끝난 뒤에야 적었다. 그 사이에
 * 예외가 나면 그 실행에서 쓴 호출이 통째로 잊힌다. 그리고
 * `/api/drawing-jobs/[jobId]/run` 은 실패 시 상태를 **QUEUED 로 되돌려
 * 재시도를 허용한다.** 잊힌 만큼 예산을 매번 넘어설 수 있었다
 * (실측 2026-07-28).
 *
 * 비용은 사용자 돈이거나 서버 키다. 넘는 쪽으로 새면 안 된다(§7).
 */
async function makePng(width = 100, height = 80): Promise<ArrayBuffer> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  return Uint8Array.from(png).buffer;
}

const quality = {
  width: 100, height: 80, channels: 3, contrast: 0.5, edgeDensity: 0.2,
  gradientVariance: 900, lowContrast: false, blurry: false, recommendedScale: 1, warnings: [],
};

async function rasterSource(): Promise<PreparedDrawingSource> {
  const image = await makePng();
  const page: PreparedDrawingPage = {
    pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
    renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0, rasterOpCount: 1,
    renderHash: 'render-0', quality,
    imageBuffer: image,
  } as unknown as PreparedDrawingPage;
  return {
    documentHash: 'd'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image', pages: [page],
  } as PreparedDrawingSource;
}

describe('AI 호출 예산 — 쓴 즉시 기록', () => {
  beforeEach(() => {
    _resetJobsForTests();
  });

  it('첫 시도에서 쓴 호출은 그 뒤 예외가 나도 남는다', async () => {
    const source = await rasterSource();
    const budget = { maxPages: 1, maxVlmCalls: 100, maxPixels: 100_000, deadlineMs: 60_000 };
    const job = createJob({
      documentHash: 'd'.repeat(64), ownerId: 'owner-budget', budget, estimatedPages: 1,
    });

    let calls = 0;
    // 첫 시도는 coverage-auditor가 실제 재스캔 대상을 남긴다. 대상이 없는
    // 전면 재시도는 금지됐으므로, 이 영수증이 두 번째 호출의 명시 근거다.
    // 두 번째 호출에서 예외가 나도 첫 호출 사용량은 남아야 한다.
    const executeTeam = jest.fn(async () => {
      calls += 1;
      if (calls > 1) throw new Error('PROVIDER_DOWN');
      return {
        success: true,
        components: [], connections: [], confidence: 0,
        drawingReview: {
          snapshot: {
            drawingHash: source.documentHash, mimeType: source.mimeType, page: 1,
            width: 100, height: 80, quality,
          },
          envelopes: [{
            role: 'coverage-auditor', outputHash: 'audit-output', drawingHash: source.documentHash,
            provider: 'gemini', model: 'test', promptVersion: 'test', durationMs: 1,
            data: {
              rescanTargets: [{
                id: 'retry-region-0', sourceId: 'variant:original:region:0',
                reason: 'low-coverage', bounds: { x: 0, y: 0, w: 60, h: 60, page: 1 },
                suggestedRoles: ['symbols'], confidence: 0.95,
              }],
              warnings: [], confidence: 0.95,
            },
          }],
          failures: [],
          coverage: {
            roles: {
              symbols: { variantId: 'variant:original', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
              connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
              text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 7 },
              logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
              'coverage-auditor': { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
            },
            plannedCalls: 19, complete: false, maxRegionCallsPerRole: 16,
          },
        },
      };
    });

    await expect(runDocumentAnalysis({
      bytes: await makePng(),
      mimeType: 'image/png',
      ownerId: 'owner-budget',
      jobId: job.jobId,
      budget,
      maxPagesPerRun: 1,
      preparationPages: [0],
      vision: { provider: 'gemini', apiKey: 'test-key' },
    } as never, {
      prepareSource: async () => source,
      executeTeam: executeTeam as never,
    } as never)).rejects.toThrow();

    expect(executeTeam.mock.calls.length).toBeGreaterThan(1);
    // 예외가 났어도 첫 시도분은 저장돼 있어야 한다. 안 그러면 재시도가
    // 0 에서 다시 시작해 문서 예산을 넘는다.
    expect(getJob(job.jobId)?.vlmCallsUsed ?? 0).toBeGreaterThan(0);
  }, 60_000);
});
