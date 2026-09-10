import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { uncertaintyDocument, readSymbol } from '../src/agent/drawing/test-support/uncertainty-document';
import { applyDrawingCorrection } from '../src/agent/drawing/apply-drawing-correction';
import type { DrawingDocumentV3 } from '../src/agent/drawing/types-v3';

// Controlled source/HTTP fixtures exercise real rendering and correction semantics.
// They do not authenticate real customers, call paid AI, or certify drawings.
function documentFixture(hash = 'a', count = 45): DrawingDocumentV3 {
  const doc = uncertaintyDocument(); doc.documentHash = hash.repeat(64); doc.title = `검토 도면 ${hash.toUpperCase()}`;
  doc.pageCount = 2; doc.pages = [doc.pages[0], { ...doc.pages[0], pageIndex: 1 }];
  doc.evidenceGraph.symbols = Array.from({ length: count }, (_, i) => {
    const s = readSymbol('unread', `S${String(i + 1).padStart(3, '0')}`);
    s.evidence[0].pageIndex = i % 2;
    s.evidence[0].bounds = { x: 80 + (i % 6) * 170, y: 90 + Math.floor(i / 6) * 80, w: 70, h: 30 };
    return s;
  });
  doc.unresolvedItems = doc.evidenceGraph.symbols.map((s, i) => ({ id: `u-${i}`, code: 'UNREADABLE_SYMBOL', displayId: s.displayId,
    pageIndex: i % 2, bounds: s.evidence[0].bounds, candidates: ['breaker', 'fuse'], note: `QF-${i + 1} 기기 종류를 원본에서 확인하세요.` }));
  doc.unresolvedItems.push({ id: 'source', code: 'LOW_RESOLUTION_HOLD', displayId: 'P01-S001', pageIndex: 0,
    bounds: { x: 80, y: 90, w: 70, h: 30 }, candidates: ['not-a-type'], note: '원본 품질 점검 전용 항목' });
  doc.verification = { ...doc.verification, claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL', 'LOW_RESOLUTION_HOLD'] };
  return doc;
}
const upload = (name = 'review.dxf') => ({ name, mimeType: 'application/dxf', buffer: Buffer.from('0\nEOF\n') });
async function load(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tools/sld');
  await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles(upload());
  await expect(page.getByRole('heading', { name: '검토 도면 A', exact: true })).toBeVisible();
}
async function capture(page: Page, label: string) {
  const dir = process.env.FULLSTACK_SCREEN_DIR;
  if (dir) { mkdirSync(dir, { recursive: true }); await page.screenshot({ path: `${dir}/${label}.png`, fullPage: false, animations: 'disabled' }); }
}
for (const width of [1440, 390]) {
  test(`review queue filters, retains drafts and recovers from a failed edit (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let document = documentFixture(); let attempts = 0; const keys: string[] = [];
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/drawing-jobs', (r) => r.fulfill({ json: { success: true, data: { jobId: 'review-a', status: 'COMPLETE', document } } }));
    await page.route('**/api/drawing-jobs/review-a/corrections', (r) => {
      const input = r.request().postDataJSON(); attempts++; keys.push(input.idempotencyKey);
      if (attempts === 1) return r.fulfill({ status: 503, json: { success: false, error: { message: '합성 일시 장애: 입력을 유지합니다.' } } });
      document = applyDrawingCorrection(document, { ...input, correctedBy: 'synthetic-reviewer' });
      return r.fulfill({ json: { success: true, data: { document, resumeAvailable: false } } });
    });
    await page.goto('/tools/sld');
    await capture(page, `upload-after-${width}`);
    await load(page);
    const queue = page.getByRole('region', { name: '미확정 검토 작업', exact: true });
    await queue.scrollIntoViewIfNeeded(); await capture(page, `review-after-${width}`);
    await expect(queue.getByRole('status')).toContainText('표시 40 / 검색 결과 46건');
    await queue.getByRole('button', { name: '다음 6건 더 보기', exact: true }).click();
    await expect(queue.getByRole('list', { name: '검토 항목 목록' }).getByRole('listitem')).toHaveCount(46);
    await queue.getByRole('combobox', { name: '미확정 항목 종류' }).selectOption('source');
    await expect(queue.getByRole('textbox')).toHaveCount(0);
    await expect(queue.getByRole('button', { name: 'not-a-type 선택' })).toHaveCount(0);
    await queue.getByRole('button', { name: '필터 초기화', exact: true }).click();
    await queue.getByRole('searchbox', { name: '미확정 항목 검색' }).fill('P01-S001');
    const input = queue.getByRole('textbox', { name: 'P01-S001 직접 수정값', exact: true });
    await input.fill('breaker');
    await queue.getByRole('searchbox').fill('검색결과없음');
    await expect(queue.getByText('현재 필터에 맞는 항목이 없습니다.', { exact: true })).toBeVisible();
    await queue.getByRole('searchbox').fill('P01-S001');
    await expect(input).toHaveValue('breaker');
    await page.getByRole('button', { name: '수량', exact: true }).click();
    await page.getByRole('button', { name: '미확정 46', exact: true }).click();
    await expect(input).toHaveValue('breaker');
    await queue.getByRole('button', { name: 'P01-S001 원본 위치 확인', exact: true }).first().click();
    await queue.scrollIntoViewIfNeeded(); await capture(page, `review-before-save-${width}`);
    await queue.getByRole('button', { name: '수정 반영', exact: true }).click();
    await expect(queue.getByRole('alert')).toHaveText('합성 일시 장애: 입력을 유지합니다.');
    await expect(input).toHaveValue('breaker'); await capture(page, `review-error-${width}`);
    await queue.getByRole('button', { name: '수정 반영', exact: true }).click();
    await expect(page.getByRole('button', { name: '미확정 45', exact: true })).toBeVisible();
    expect(keys[0]).toBe(keys[1]); expect(attempts).toBe(2);
    await expect(queue.getByText('원본 품질 점검 전용 항목', { exact: true })).toBeVisible();
    await queue.getByRole('button', { name: '필터 초기화', exact: true }).click();
    await queue.getByRole('combobox', { name: '미확정 항목 페이지' }).selectOption('1');
    await expect(queue.getByRole('status')).toContainText('검색 결과 22건');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await queue.scrollIntoViewIfNeeded(); await capture(page, `review-filtered-${width}`);
  });
}

test('old correction cannot replace a newly uploaded document', async ({ page }) => {
  let creates = 0; let release!: () => void; let entered!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const old = documentFixture('a', 1), next = documentFixture('b', 1);
  await page.route('**/api/drawing-jobs', (r) => r.fulfill({ json: { success: true, data: { jobId: ++creates === 1 ? 'review-a' : 'review-b', status: 'COMPLETE', document: creates === 1 ? old : next } } }));
  await page.route('**/api/drawing-jobs/review-a/corrections', async (r) => {
    entered(); await pending;
    await r.fulfill({ json: { success: true, data: { document: { ...old, title: '오래된 응답' } } } }).catch(() => undefined);
  });
  await load(page);
  await page.getByRole('button', { name: 'breaker 선택', exact: true }).click(); await started;
  await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles(upload('new.dxf'));
  await expect(page.getByRole('heading', { name: '검토 도면 B', exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'breaker 선택', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: '오래된 응답', exact: true })).toHaveCount(0);
});

test('stale edit can refresh the owned result without losing the draft', async ({ page }) => {
  let document = documentFixture('a', 1); const versions: string[] = [];
  await page.route('**/api/drawing-jobs', (r) => r.fulfill({ json: { success: true, data: { jobId: 'review-a', status: 'COMPLETE', document } } }));
  await page.route('**/api/drawing-jobs?jobId=review-a', (r) => r.fulfill({ json: { success: true, data: { jobId: 'review-a', status: 'COMPLETE', document } } }));
  await page.route('**/api/drawing-jobs/review-a/corrections', (r) => {
    const input = r.request().postDataJSON(); versions.push(input.expectedUpdatedAt);
    if (versions.length === 1) {
      document = { ...document, updatedAt: '2026-09-10T08:00:00.000Z' };
      return r.fulfill({ status: 409, json: { success: false, error: { code: 'STALE_DOCUMENT', message: '다른 수정이 먼저 반영되었습니다.' } } });
    }
    document = applyDrawingCorrection(document, { ...input, correctedBy: 'synthetic-reviewer' });
    return r.fulfill({ json: { success: true, data: { document } } });
  });
  await load(page);
  const input = page.getByRole('textbox', { name: 'P01-S001 직접 수정값', exact: true }); await input.fill('breaker');
  await page.getByRole('button', { name: '수정 반영', exact: true }).click();
  await page.getByRole('button', { name: '최신 결과 다시 불러오기', exact: true }).click();
  await expect(input).toHaveValue('breaker');
  await page.getByRole('button', { name: '수정 반영', exact: true }).click();
  await expect(page.getByRole('button', { name: '미확정 1', exact: true })).toBeVisible();
  expect(versions).toHaveLength(2); expect(versions[1]).not.toBe(versions[0]);
});
